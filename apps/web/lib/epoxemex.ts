import {
  calcularPartida,
  calcularTotales,
  consolidarLinea,
  type ResultadoPartida,
  type Totales,
} from '@celmi/core';
import { PROPUESTAS_EPOXEMEX, type PropuestaFixture } from '@celmi/core/fixtures/epoxemex';

export { PROPUESTAS_EPOXEMEX, UTILIDAD_EPOXEMEX } from '@celmi/core/fixtures/epoxemex';

export const FOLIO_EPOXEMEX = 'CELMISOLUTIONS-2026001253';

export interface PropuestaCalculada {
  propuesta: PropuestaFixture;
  partidas: ResultadoPartida[];
  totales: Totales;
}

/** Calcula una propuesta con la utilidad que corresponda a cada partida; null si alguna utilidad es inválida. */
export function calcularPropuesta(
  propuesta: PropuestaFixture,
  utilidadDe: (sku: string) => string,
): PropuestaCalculada | null {
  try {
    const partidas = propuesta.partidas.map((p) =>
      calcularPartida({
        costoUnitario: p.costoUnitario,
        cantidad: p.cantidad,
        utilidadPct: utilidadDe(p.sku),
      }),
    );
    return { propuesta, partidas, totales: calcularTotales([consolidarLinea(partidas)]) };
  } catch {
    return null;
  }
}

/**
 * Monto de referencia para el dashboard: la propuesta de menor monto (regla confirmada).
 * PENDIENTE de confirmar: si los adicionales (tipo «Accesorio») cuentan como alternativa o se suman.
 * Mientras tanto se excluyen y la interfaz lo indica.
 */
export function montoReferencia(utilidad: string): bigint {
  const totales = PROPUESTAS_EPOXEMEX.filter((p) => p.tipo !== 'Accesorio')
    .map((p) => calcularPropuesta(p, () => utilidad)?.totales.total)
    .filter((t): t is bigint => t !== undefined);
  return totales.reduce((min, t) => (t < min ? t : min));
}
