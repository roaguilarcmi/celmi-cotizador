import { costoPartida, formatearMXN } from '@celmi/core';
import type { PropuestaCotizacion } from '@celmi/validation';
import type { CatalogosCotizacion, PartidaFila, PropuestaFila, RevisionDetalle } from '@/lib/datos';
import { hoyLocal } from '@/lib/vigencia';

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
  /** Se escribe en cada partida (ya no es catálogo, 0027). */
  marca: string;
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
  marca: '',
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
  vigencia: '',
  costo_anterior: null,
  componentes: [],
  prorratear_entre: [],
});

const desdeFila = (pa: PartidaFila, componentes: FilaEditable[] = []): FilaEditable => ({
  clave: pa.id,
  id: pa.id,
  sku: pa.sku,
  marca: pa.marca ?? '',
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
        vigencia: f.vigencia,
      }
    : null;

type ContenidoPayload = PropuestaCotizacion['partidas'][number]['descripcion_contenido'];

const camposPayload = (f: FilaEditable, esAdicional: boolean) => ({
  ...(f.id ? { id: f.id } : {}),
  clave: f.clave,
  sku: f.sku.trim(),
  marca: f.marca.trim(),
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

export type CampoConError = 'descripcion' | 'cantidad' | 'costo_unitario' | 'vigencia' | 'prorratear_entre';

/** El precio del mayorista ya venció (2026-10-09: no se captura ni se avanza con uno vencido). */
export const precioVencido = (f: Pick<FilaEditable, 'vigencia'>) =>
  Boolean(f.vigencia) && f.vigencia < hoyLocal();

/** Problemas de una fila, para marcarla antes de guardar (la base vuelve a validar). */
export function erroresDeFila(f: FilaEditable): Partial<Record<CampoConError, string>> {
  const e: Partial<Record<CampoConError, string>> = {};
  if (!f.descripcion.trim()) e.descripcion = 'Falta la descripción';
  if (!/^\d+$/.test(f.cantidad.trim()) || Number(f.cantidad) <= 0)
    e.cantidad = 'Cantidad entera mayor que cero';
  const costo = f.costo_unitario.trim().replaceAll(',', '');
  if (costo && !/^\d+(\.\d{1,2})?$/.test(costo)) e.costo_unitario = 'Importe con máximo 2 decimales';
  if (precioVencido(f))
    e.vigencia = 'El precio del mayorista ya venció: pide uno vigente o actualiza la fecha';
  if (f.presentacion === 'prorrateada' && f.prorratear_entre.length === 0)
    e.prorratear_entre = 'Elige entre qué partidas se reparte';
  return e;
}

/**
 * Costo de una fila en su propia moneda (unitario y total), o null si aún no se puede calcular. El T.C. lo fija
 * quien autoriza (0027), así que aquí no se convierte a pesos.
 */
export function costoDeFila(f: FilaEditable) {
  const errores = Object.keys(erroresDeFila(f));
  if (errores.some((k) => k === 'cantidad' || k === 'costo_unitario') || !f.costo_unitario.trim())
    return null;
  try {
    const c = costoPartida({
      costoUnitario: f.costo_unitario.trim().replaceAll(',', ''),
      tipoCambio: '1',
      cantidad: Number(f.cantidad),
    });
    return { moneda: f.moneda, unitario: c.costoUnitarioMXN, total: c.costoTotal };
  } catch {
    return null;
  }
}

/** «$1,234.50» en pesos; «USD 1,234.50» en otra moneda. */
export const formatearCosto = (centavos: bigint, moneda: string) =>
  moneda === 'MXN' ? formatearMXN(centavos) : `${moneda} ${formatearMXN(centavos).replace('$', '')}`;

/** Suma por moneda, pesos primero: «$10,000.00 + USD 1,200.00». */
export function textoPorMoneda(totales: Map<string, bigint>) {
  const monedas = [...totales.keys()].sort((a, b) =>
    a === 'MXN' ? -1 : b === 'MXN' ? 1 : a.localeCompare(b),
  );
  return monedas.length
    ? monedas.map((m) => formatearCosto(totales.get(m) ?? 0n, m)).join(' + ')
    : formatearMXN(0n);
}

/** Todas las filas (partidas, sus adicionales y cargos) de una propuesta. */
export const todasLasFilas = (p: PropuestaEditable) => p.partidas.flatMap((f) => [f, ...f.componentes]);

export function resumenPropuesta(p: PropuestaEditable) {
  const costos = new Map<string, bigint>();
  let sinCosto = 0;
  let piezas = 0;
  for (const f of todasLasFilas(p)) {
    const c = costoDeFila(f);
    if (c) costos.set(c.moneda, (costos.get(c.moneda) ?? 0n) + c.total);
    else sinCosto += 1;
  }
  for (const f of p.partidas) if (f.presentacion !== 'prorrateada') piezas += Number(f.cantidad) || 0;
  const partidas = p.partidas.filter((f) => f.presentacion !== 'prorrateada').length;
  const cargos = p.partidas.length - partidas;
  return { partidas, cargos, piezas, sinCosto, costoTexto: textoPorMoneda(costos) };
}

export const nombreCatalogo = (lista: { id: string; nombre: string }[], id: string | null) =>
  lista.find((x) => x.id === id)?.nombre ?? '';

export type Catalogos = CatalogosCotizacion;
