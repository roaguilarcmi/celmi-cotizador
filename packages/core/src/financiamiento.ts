import { aEscalado, dividirRedondeando, ESCALA_PORCENTAJE, type Centavos } from './decimal';

/**
 * Opciones de financiamiento (decisiones de Rodrigo, 2026-10-07). Los datos los da la financiera; aquí sólo se derivan
 * el valor residual que falte (porcentaje ↔ monto) y la tasa de interés implícita. Todos los montos son sin IVA.
 */

export type Frecuencia = 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual';

/** Meses que abarca cada pago. */
export const MESES_POR_PAGO: Record<Frecuencia, number> = {
  mensual: 1,
  bimestral: 2,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

/** Número de pagos de un plazo; el plazo debe ser múltiplo de los meses de cada pago (36 meses trimestral → 12). */
export function numeroDePagos(plazoMeses: number, frecuencia: Frecuencia): number {
  const meses = MESES_POR_PAGO[frecuencia];
  if (!Number.isSafeInteger(plazoMeses) || plazoMeses <= 0)
    throw new Error('El plazo debe ser un entero positivo');
  if (plazoMeses % meses !== 0)
    throw new Error(`Un plazo de ${plazoMeses} meses no se divide en pagos ${frecuencia}es`);
  return plazoMeses / meses;
}

const CIEN_POR_CIENTO = 100n * 10n ** BigInt(ESCALA_PORCENTAJE);

/** «12.3456» desde un entero escalado a 4 decimales. */
const porcentajeATexto = (p: bigint) => {
  const s = p.toString().padStart(5, '0');
  return `${s.slice(0, -4)}.${s.slice(-4)}`.replace(/\.?0+$/, '') || '0';
};

/**
 * Valor residual (Full PayOut): se captura en porcentaje del valor de los equipos o en monto, y se calcula el otro.
 * Porcentaje con 4 decimales; monto en centavos (mitad hacia arriba).
 */
export function valorResidual(
  valor: Centavos,
  capturado: { porcentaje: string } | { monto: Centavos },
): { porcentaje: string; monto: Centavos } {
  if (valor <= 0n) throw new Error('El valor de los equipos debe ser mayor que cero');
  if ('porcentaje' in capturado) {
    const p = aEscalado(capturado.porcentaje, ESCALA_PORCENTAJE);
    if (p < 0n || p > CIEN_POR_CIENTO) throw new Error('El porcentaje debe estar entre 0 y 100');
    return { porcentaje: porcentajeATexto(p), monto: dividirRedondeando(valor * p, CIEN_POR_CIENTO) };
  }
  if (capturado.monto < 0n || capturado.monto > valor)
    throw new Error('El valor residual no puede ser mayor que el valor de los equipos');
  return {
    porcentaje: porcentajeATexto(dividirRedondeando(capturado.monto * CIEN_POR_CIENTO, valor)),
    monto: capturado.monto,
  };
}

/**
 * Tasa de interés anual nominal implícita (decisión 2026-10-07): la tasa por periodo `i` que iguala el valor de los
 * equipos con los pagos (equipos + seguro) **vencidos**, multiplicada por los pagos al año. Devuelve el porcentaje con
 * 4 decimales («14.3842»), o null si no hay pagos.
 *
 * Es una razón, no dinero: se resuelve por bisección en punto flotante y se redondea; los montos de entrada son exactos.
 */
export function tasaAnualNominal({
  valor,
  pagoPorPeriodo,
  pagos,
  frecuencia,
}: {
  valor: Centavos;
  /** Pago de equipos + seguro de cada periodo. */
  pagoPorPeriodo: Centavos;
  pagos: number;
  frecuencia: Frecuencia;
}): string | null {
  if (valor <= 0n || pagoPorPeriodo <= 0n || pagos <= 0) return null;
  const v = Number(valor);
  const a = Number(pagoPorPeriodo);
  // Valor presente de los pagos a la tasa i (por periodo); decrece con i.
  const presente = (i: number) => (i === 0 ? a * pagos : (a * (1 - (1 + i) ** -pagos)) / i);
  let bajo = -0.99;
  let alto = 10;
  if (presente(alto) > v || presente(bajo) < v) return null;
  for (let k = 0; k < 200; k++) {
    const medio = (bajo + alto) / 2;
    if (presente(medio) > v) bajo = medio;
    else alto = medio;
  }
  const anual = ((bajo + alto) / 2) * (12 / MESES_POR_PAGO[frecuencia]) * 100;
  return (Math.round(anual * 10000) / 10000).toFixed(4);
}
