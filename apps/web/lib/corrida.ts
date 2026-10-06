import {
  calcularCorrida,
  presentarPropuestas,
  aEscalado,
  ESCALA_DINERO,
  type Corrida,
  type PropuestaPresentable,
  type PartidaCorrida,
  type PropuestaPresentada,
} from '@celmi/core';
import type { RevisionDetalle } from './datos';

/**
 * Puente entre la revisión que entrega la base y la corrida de `@celmi/core`. Lo usan la pantalla de autorización
 * (para mostrar) y la acción del servidor (para recalcular antes de registrar los precios), así ambos calculan igual.
 */

/** La API entrega los numeric como número («18.5»): se pasan a texto con la escala exacta. */
export const decimal = (v: number | string, escala: number) => {
  const t = Number(v).toFixed(escala);
  return t.includes('.') ? t.replace(/0+$/, '').replace(/\.$/, '') : t;
};

export function entradaCorrida(
  revision: RevisionDetalle,
  utilidadDe: (partidaId: string) => string,
): PropuestaPresentable<PartidaCorrida>[] {
  return revision.propuestas.map((p) => ({
    id: p.id,
    esAdicional: p.es_adicional,
    partidas: p.partidas.map((pa) => {
      if (!pa.costo) throw new Error('Hay partidas sin costo');
      return {
        id: pa.id,
        padreId: pa.partida_padre_id,
        presentacion: pa.presentacion,
        cantidad: pa.cantidad,
        seSuma: pa.se_suma,
        prorratearEntre: pa.prorrateos.map((x) => x.destino_id),
        costoUnitario: decimal(pa.costo.costo_unitario, 2),
        tipoCambio: decimal(pa.costo.tipo_cambio, 5),
        utilidadPct: utilidadDe(pa.id),
      };
    }),
  }));
}

/** Corrida con la utilidad indicada; null si algún valor no es válido (la pantalla lo señala en su celda). */
export function corridaDe(revision: RevisionDetalle, utilidadDe: (id: string) => string): Corrida | null {
  try {
    return calcularCorrida(entradaCorrida(revision, utilidadDe));
  } catch {
    return null;
  }
}

/** Líneas y totales para el cliente con los precios ya autorizados (sin ver la utilidad). */
export function presentacionAutorizada(revision: RevisionDetalle): PropuestaPresentada[] | null {
  try {
    return presentarPropuestas(
      revision.propuestas.map((p) => ({
        id: p.id,
        esAdicional: p.es_adicional,
        partidas: p.partidas.map((pa) => {
          if (!pa.precio) throw new Error('Sin precio');
          return {
            id: pa.id,
            padreId: pa.partida_padre_id,
            presentacion: pa.presentacion,
            cantidad: pa.cantidad,
            seSuma: pa.se_suma,
            prorratearEntre: pa.prorrateos.map((x) => x.destino_id),
            precioUnitario: aEscalado(decimal(pa.precio.precio_unitario, 2), ESCALA_DINERO),
          };
        }),
      })),
    );
  } catch {
    return null;
  }
}
