import {
  aEscalado,
  CATEGORIAS_PRODUCTO,
  costoPartida,
  ESCALA_DINERO,
  normalizarSku,
  sugerirCategoria,
  type EsquemaSolicitud,
  type FormatoSolicitud,
  type PropuestaSolicitud,
} from '@celmi/core';
import { decimal } from './corrida';
import type { RevisionDetalle } from './datos';

/**
 * Solicitud de corrida financiera (2026-10-23): puente entre la revisión autorizada y las reglas de `@celmi/core`.
 * Lo usan la pantalla (vista previa) y el servidor (al generar el Excel), así ambos calculan igual.
 */

export const ESQUEMAS_CON_SOLICITUD = ['arrendamiento', 'credito_simple'] as const;

export const aplicaSolicitud = (revision: Pick<RevisionDetalle, 'esquema' | 'estado'>) =>
  (ESQUEMAS_CON_SOLICITUD as readonly string[]).includes(revision.esquema) &&
  (revision.estado === 'autorizada' || revision.estado === 'emitida');

/** Propuestas con costo en pesos (T.C. autorizado) y precio autorizado; null si falta algo. */
export function propuestasSolicitud(
  revision: RevisionDetalle,
  tiposCambio: Record<string, string>,
): PropuestaSolicitud[] | null {
  try {
    return revision.propuestas.map((p) => ({
      id: p.id,
      esAdicional: p.es_adicional,
      partidas: p.partidas.map((pa) => {
        if (!pa.costo || !pa.precio) throw new Error('Partida sin costo o sin precio autorizado');
        const tc = pa.costo.moneda === 'MXN' ? '1' : tiposCambio[pa.costo.moneda];
        if (!tc) throw new Error(`Falta el T.C. de ${pa.costo.moneda}`);
        return {
          id: pa.id,
          padreId: pa.partida_padre_id,
          presentacion: pa.presentacion,
          cantidad: pa.cantidad,
          seSuma: pa.se_suma,
          prorratearEntre: pa.prorrateos.map((x) => x.destino_id),
          precioUnitario: aEscalado(decimal(pa.precio.precio_unitario, 2), ESCALA_DINERO),
          costoUnitario: costoPartida({
            costoUnitario: decimal(pa.costo.costo_unitario, 2),
            tipoCambio: tc,
            cantidad: 1,
          }).costoUnitarioMXN,
        };
      }),
    }));
  } catch {
    return null;
  }
}

export type CategoriasGuardadas = Record<string, string>;

/** Categoría inicial de una partida: la guardada para su número de parte o la sugerida por su descripción. */
export function categoriaInicial(
  pa: { sku: string; descripcion: string },
  guardadas: CategoriasGuardadas,
): string {
  const sku = normalizarSku(pa.sku);
  return (sku && guardadas[sku]) || sugerirCategoria(pa.descripcion) || '';
}

export const esCategoria = (c: unknown): c is string =>
  typeof c === 'string' && (CATEGORIAS_PRODUCTO as readonly string[]).includes(c);

/** Formato del mayorista del arrendamiento (sin mayorista o sin formato propio: el de CELMI). */
export function formatoDe(
  revision: Pick<RevisionDetalle, 'mayorista_arrendamiento_id'>,
  mayoristas: { id: string; formato_arrendamiento: 'ct' | 'ingram' | null }[],
): FormatoSolicitud {
  return (
    mayoristas.find((m) => m.id === revision.mayorista_arrendamiento_id)?.formato_arrendamiento ?? 'celmi'
  );
}

/** Esquemas que se pueden pedir: crédito simple es uno solo; arrendamiento, puro y/o financiero. */
export const esquemasPosibles = (esquema: string): EsquemaSolicitud[] =>
  esquema === 'credito_simple' ? ['credito'] : ['vjm', 'fpo'];

export const FORMATOS: Record<FormatoSolicitud, { nombre: string; detalle: string }> = {
  ct: { nombre: 'CT', detalle: 'formato de CT Servicios Financieros' },
  ingram: { nombre: 'Ingram', detalle: 'formato de Ingram (Mix de equipo)' },
  celmi: { nombre: 'CELMI', detalle: 'formato propio de CELMI Solutions' },
};
