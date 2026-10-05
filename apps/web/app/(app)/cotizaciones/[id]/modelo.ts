import { costoPartida, formatearMXN } from '@celmi/core';
import type { PropuestaCotizacion } from '@celmi/validation';
import type { CatalogosCotizacion, PropuestaFila, RevisionDetalle } from '@/lib/datos';

/** Partida tal como se edita en pantalla: los números van como texto mientras se escriben. */
export interface FilaEditable {
  /** Clave local estable (las nuevas aún no tienen id). */
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
  oculta_al_cliente: boolean;
  mayorista_id: string | null;
  moneda: string;
  costo_unitario: string;
  tipo_cambio: string;
  vigencia: string;
  /** «Precio anterior» de una mejora de precio (sólo lectura). */
  costo_anterior: string | null;
}

export interface PropuestaEditable {
  clave: string;
  id?: string;
  nombre: string;
  tipo: string;
  es_adicional: boolean;
  partidas: FilaEditable[];
}

let consecutivo = 0;
export const claveNueva = (prefijo = 'nueva') => `${prefijo}-${Date.now()}-${++consecutivo}`;

export const filaVacia = (unidadPorOmision: string | null): FilaEditable => ({
  clave: claveNueva('partida'),
  sku: '',
  marca_id: null,
  descripcion: '',
  descripcion_contenido: null,
  entrega: '',
  unidad_id: unidadPorOmision,
  cantidad: '1',
  se_suma: false,
  oculta_al_cliente: false,
  mayorista_id: null,
  moneda: 'MXN',
  costo_unitario: '',
  tipo_cambio: '1',
  vigencia: '',
  costo_anterior: null,
});

/** Quita ceros sobrantes de un decimal de la base («18.50000» → «18.5»). */
const limpiar = (v: string) => (v.includes('.') ? v.replace(/0+$/, '').replace(/\.$/, '') : v);

export function desdeRevision(revision: RevisionDetalle): PropuestaEditable[] {
  return revision.propuestas.map((p: PropuestaFila) => ({
    clave: p.id,
    id: p.id,
    nombre: p.nombre,
    tipo: p.tipo,
    es_adicional: p.es_adicional,
    partidas: p.partidas.map((pa) => ({
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
      oculta_al_cliente: pa.oculta_al_cliente,
      mayorista_id: pa.costo?.mayorista_id ?? null,
      moneda: pa.costo?.moneda ?? 'MXN',
      costo_unitario: pa.costo ? Number(pa.costo.costo_unitario).toFixed(2) : '',
      tipo_cambio: pa.costo ? limpiar(String(pa.costo.tipo_cambio)) : '1',
      vigencia: pa.costo?.vigencia ?? '',
      costo_anterior: pa.costo?.costo_anterior != null ? Number(pa.costo.costo_anterior).toFixed(2) : null,
    })),
  }));
}

/** Lo que se envía al servidor (el servidor vuelve a validar con propuestasCotizacionSchema). */
export function aPayload(propuestas: PropuestaEditable[]): PropuestaCotizacion[] {
  return propuestas.map((p) => ({
    ...(p.id ? { id: p.id } : {}),
    nombre: p.nombre.trim(),
    tipo: p.tipo,
    es_adicional: p.es_adicional,
    partidas: p.partidas.map((f) => ({
      ...(f.id ? { id: f.id } : {}),
      sku: f.sku.trim(),
      marca_id: f.marca_id,
      descripcion: f.descripcion.trim(),
      descripcion_contenido: (f.descripcion_contenido ??
        null) as PropuestaCotizacion['partidas'][number]['descripcion_contenido'],
      entrega: f.entrega.trim(),
      unidad_id: f.unidad_id,
      cantidad: Number(f.cantidad),
      se_suma: p.es_adicional ? f.se_suma : false,
      oculta_al_cliente: f.oculta_al_cliente,
      costo: f.costo_unitario.trim()
        ? {
            mayorista_id: f.mayorista_id,
            moneda: f.moneda,
            costo_unitario: f.costo_unitario.trim().replaceAll(',', ''),
            tipo_cambio: f.moneda === 'MXN' ? '1' : f.tipo_cambio.trim(),
            vigencia: f.vigencia,
          }
        : null,
    })),
  }));
}

export type CampoConError = 'descripcion' | 'cantidad' | 'costo_unitario' | 'tipo_cambio';

/** Problemas de una fila, para marcar la celda antes de guardar (la base vuelve a validar). */
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
  return e;
}

/** Costo en MXN de una fila (unitario y total), o null si aún no se puede calcular. */
export function costoDeFila(f: FilaEditable) {
  if (Object.keys(erroresDeFila(f)).some((k) => k !== 'descripcion') || !f.costo_unitario.trim()) return null;
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

export function resumenPropuesta(p: PropuestaEditable) {
  let costo = 0n;
  let sinCosto = 0;
  let piezas = 0;
  for (const f of p.partidas) {
    piezas += Number(f.cantidad) || 0;
    const c = costoDeFila(f);
    if (c) costo += c.costoTotal;
    else sinCosto += 1;
  }
  return { partidas: p.partidas.length, piezas, costo, sinCosto, costoTexto: formatearMXN(costo) };
}

export const nombreCatalogo = (lista: { id: string; nombre: string }[], id: string | null) =>
  lista.find((x) => x.id === id)?.nombre ?? '';

export type Catalogos = CatalogosCotizacion;
