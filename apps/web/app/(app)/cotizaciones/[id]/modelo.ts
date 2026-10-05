import { costoPartida, formatearMXN } from '@celmi/core';
import type { PropuestaCotizacion } from '@celmi/validation';
import type { CatalogosCotizacion, PartidaFila, PropuestaFila, RevisionDetalle } from '@/lib/datos';

/**
 * linea: partida visible (o adicional en línea propia) · incluida: adicional dentro del precio de su partida ·
 * prorrateada: cargo repartido entre partidas (reglas 2026-10-05).
 */
export type Presentacion = 'linea' | 'incluida' | 'prorrateada';

/** Partida tal como se edita en pantalla: los números van como texto mientras se escriben. */
export interface FilaEditable {
  /** Clave local estable (las nuevas aún no tienen id; en las guardadas es su id). */
  clave: string;
  id?: string;
  sku: string;
  marca_id: string | null;
  descripcion: string;
  descripcion_contenido: unknown;
  entrega: string;
  unidad_id: string | null;
  cantidad: string;
  se_suma: boolean;
  presentacion: Presentacion;
  mayorista_id: string | null;
  moneda: string;
  costo_unitario: string;
  tipo_cambio: string;
  vigencia: string;
  /** «Precio anterior» de una mejora de precio (sólo lectura). */
  costo_anterior: string | null;
  /** Adicionales de la partida (sólo en partidas de primer nivel). */
  componentes: FilaEditable[];
  /** Claves de las partidas entre las que se reparte (sólo cargos prorrateados). */
  prorratear_entre: string[];
}

export interface PropuestaEditable {
  clave: string;
  id?: string;
  nombre: string;
  tipo: string;
  es_adicional: boolean;
  /** Partidas de primer nivel (con sus adicionales) y cargos prorrateados. */
  partidas: FilaEditable[];
}

let consecutivo = 0;
export const claveNueva = (prefijo = 'nueva') => `${prefijo}-${Date.now()}-${++consecutivo}`;

export const filaVacia = (
  unidadPorOmision: string | null,
  presentacion: Presentacion = 'linea',
): FilaEditable => ({
  clave: claveNueva('partida'),
  sku: '',
  marca_id: null,
  descripcion: '',
  descripcion_contenido: null,
  entrega: '',
  unidad_id: unidadPorOmision,
  cantidad: '1',
  se_suma: false,
  presentacion,
  mayorista_id: null,
  moneda: 'MXN',
  costo_unitario: '',
  tipo_cambio: '1',
  vigencia: '',
  costo_anterior: null,
  componentes: [],
  prorratear_entre: [],
});

/** Quita ceros sobrantes de un decimal de la base («18.50000» → «18.5»). */
const limpiar = (v: string) => (v.includes('.') ? v.replace(/0+$/, '').replace(/\.$/, '') : v);

const desdeFila = (pa: PartidaFila, componentes: FilaEditable[] = []): FilaEditable => ({
  clave: pa.id,
  id: pa.id,
  sku: pa.sku,
  marca_id: pa.marca_id,
  descripcion: pa.descripcion,
  descripcion_contenido: pa.descripcion_contenido,
  entrega: pa.entrega,
  unidad_id: pa.unidad_id,
  cantidad: String(pa.cantidad),
  se_suma: pa.se_suma,
  presentacion: pa.presentacion ?? 'linea',
  mayorista_id: pa.costo?.mayorista_id ?? null,
  moneda: pa.costo?.moneda ?? 'MXN',
  costo_unitario: pa.costo ? Number(pa.costo.costo_unitario).toFixed(2) : '',
  tipo_cambio: pa.costo ? limpiar(String(pa.costo.tipo_cambio)) : '1',
  vigencia: pa.costo?.vigencia ?? '',
  costo_anterior: pa.costo?.costo_anterior != null ? Number(pa.costo.costo_anterior).toFixed(2) : null,
  componentes,
  prorratear_entre: (pa.prorrateos ?? []).map((x) => x.destino_id),
});

export function desdeRevision(revision: RevisionDetalle): PropuestaEditable[] {
  return revision.propuestas.map((p: PropuestaFila) => ({
    clave: p.id,
    id: p.id,
    nombre: p.nombre,
    tipo: p.tipo,
    es_adicional: p.es_adicional,
    partidas: p.partidas
      .filter((pa) => !pa.partida_padre_id)
      .map((pa) =>
        desdeFila(
          pa,
          p.partidas.filter((c) => c.partida_padre_id === pa.id).map((c) => desdeFila(c)),
        ),
      ),
  }));
}

const costoPayload = (f: FilaEditable) =>
  f.costo_unitario.trim()
    ? {
        mayorista_id: f.mayorista_id,
        moneda: f.moneda,
        costo_unitario: f.costo_unitario.trim().replaceAll(',', ''),
        tipo_cambio: f.moneda === 'MXN' ? '1' : f.tipo_cambio.trim(),
        vigencia: f.vigencia,
      }
    : null;

type ContenidoPayload = PropuestaCotizacion['partidas'][number]['descripcion_contenido'];

const camposPayload = (f: FilaEditable, esAdicional: boolean) => ({
  ...(f.id ? { id: f.id } : {}),
  clave: f.clave,
  sku: f.sku.trim(),
  marca_id: f.marca_id,
  descripcion: f.descripcion.trim(),
  descripcion_contenido: (f.descripcion_contenido ?? null) as ContenidoPayload,
  entrega: f.entrega.trim(),
  unidad_id: f.unidad_id,
  cantidad: Number(f.cantidad),
  se_suma: esAdicional ? f.se_suma : false,
  oculta_al_cliente: f.presentacion !== 'linea',
  costo: costoPayload(f),
});

/** Lo que se envía al servidor (el servidor vuelve a validar con propuestasCotizacionSchema). */
export function aPayload(propuestas: PropuestaEditable[]): PropuestaCotizacion[] {
  return propuestas.map((p) => ({
    ...(p.id ? { id: p.id } : {}),
    nombre: p.nombre.trim(),
    tipo: p.tipo,
    es_adicional: p.es_adicional,
    partidas: p.partidas.map((f) => ({
      ...camposPayload(f, p.es_adicional),
      presentacion: f.presentacion === 'prorrateada' ? ('prorrateada' as const) : ('linea' as const),
      componentes:
        f.presentacion === 'prorrateada'
          ? []
          : f.componentes.map((c) => ({
              ...camposPayload(c, false),
              presentacion: c.presentacion === 'linea' ? ('linea' as const) : ('incluida' as const),
            })),
      // Sólo hacia partidas que siguen en la propuesta.
      prorratear_entre:
        f.presentacion === 'prorrateada'
          ? f.prorratear_entre.filter((c) =>
              p.partidas.some((x) => x.clave === c && x.presentacion !== 'prorrateada'),
            )
          : [],
    })),
  }));
}

export type CampoConError =
  'descripcion' | 'cantidad' | 'costo_unitario' | 'tipo_cambio' | 'prorratear_entre';

/** Problemas de una fila, para marcarla antes de guardar (la base vuelve a validar). */
export function erroresDeFila(f: FilaEditable): Partial<Record<CampoConError, string>> {
  const e: Partial<Record<CampoConError, string>> = {};
  if (!f.descripcion.trim()) e.descripcion = 'Falta la descripción';
  if (!/^\d+$/.test(f.cantidad.trim()) || Number(f.cantidad) <= 0)
    e.cantidad = 'Cantidad entera mayor que cero';
  const costo = f.costo_unitario.trim().replaceAll(',', '');
  if (costo && !/^\d+(\.\d{1,2})?$/.test(costo)) e.costo_unitario = 'Importe con máximo 2 decimales';
  if (f.moneda !== 'MXN' && !/^\d+(\.\d{1,5})?$/.test(f.tipo_cambio.trim()))
    e.tipo_cambio = 'Tipo de cambio con máximo 5 decimales';
  else if (f.moneda !== 'MXN' && Number(f.tipo_cambio) <= 0) e.tipo_cambio = 'Debe ser mayor que cero';
  if (f.presentacion === 'prorrateada' && f.prorratear_entre.length === 0)
    e.prorratear_entre = 'Elige entre qué partidas se reparte';
  return e;
}

/** Costo en MXN de una fila (unitario y total), o null si aún no se puede calcular. */
export function costoDeFila(f: FilaEditable) {
  const errores = Object.keys(erroresDeFila(f));
  if (
    errores.some((k) => k === 'cantidad' || k === 'costo_unitario' || k === 'tipo_cambio') ||
    !f.costo_unitario.trim()
  )
    return null;
  try {
    return costoPartida({
      costoUnitario: f.costo_unitario.trim().replaceAll(',', ''),
      tipoCambio: f.moneda === 'MXN' ? '1' : f.tipo_cambio.trim(),
      cantidad: Number(f.cantidad),
    });
  } catch {
    return null;
  }
}

/** Todas las filas (partidas, sus adicionales y cargos) de una propuesta. */
export const todasLasFilas = (p: PropuestaEditable) => p.partidas.flatMap((f) => [f, ...f.componentes]);

export function resumenPropuesta(p: PropuestaEditable) {
  let costo = 0n;
  let sinCosto = 0;
  let piezas = 0;
  for (const f of todasLasFilas(p)) {
    const c = costoDeFila(f);
    if (c) costo += c.costoTotal;
    else sinCosto += 1;
  }
  for (const f of p.partidas) if (f.presentacion !== 'prorrateada') piezas += Number(f.cantidad) || 0;
  const partidas = p.partidas.filter((f) => f.presentacion !== 'prorrateada').length;
  const cargos = p.partidas.length - partidas;
  return { partidas, cargos, piezas, costo, sinCosto, costoTexto: formatearMXN(costo) };
}

export const nombreCatalogo = (lista: { id: string; nombre: string }[], id: string | null) =>
  lista.find((x) => x.id === id)?.nombre ?? '';

export type Catalogos = CatalogosCotizacion;
