/**
 * Aritmética decimal exacta. Todo importe se maneja como entero escalado (bigint):
 * dinero en centavos (escala 2), tipo de cambio en escala 5 (decisión 2026-10-05) y porcentajes en escala 4.
 * Nunca se usan números de punto flotante para calcular dinero.
 */

/** Importe en centavos de peso (o de la moneda original, según el contexto). */
export type Centavos = bigint;

export const ESCALA_DINERO = 2;
export const ESCALA_TIPO_CAMBIO = 5;
export const ESCALA_PORCENTAJE = 4;

/** Convierte "14533.46" con escala 2 en 1453346n. Rechaza texto inválido o más decimales que la escala. */
export function aEscalado(valor: string, escala: number): bigint {
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(valor.trim());
  if (!m) throw new Error(`Valor decimal inválido: "${valor}"`);
  const [, signo, entero = '0', decimales = ''] = m;
  if (decimales.length > escala) throw new Error(`"${valor}" tiene más de ${escala} decimales`);
  const n = BigInt(entero + decimales.padEnd(escala, '0'));
  return signo ? -n : n;
}

/** División entera con redondeo a la mitad hacia arriba (0.005 → 0.01), simétrico para negativos. */
export function dividirRedondeando(numerador: bigint, denominador: bigint): bigint {
  if (denominador <= 0n) throw new Error('El denominador debe ser positivo');
  const negativo = numerador < 0n;
  const a = negativo ? -numerador : numerador;
  const q = (a * 2n + denominador) / (2n * denominador);
  return negativo ? -q : q;
}

/** 1649548n → "16495.48" */
export function centavosADecimal(c: Centavos): string {
  const negativo = c < 0n;
  const s = (negativo ? -c : c).toString().padStart(3, '0');
  return `${negativo ? '-' : ''}${s.slice(0, -2)}.${s.slice(-2)}`;
}

/** 1649548n → "$16,495.48" (formato de moneda mexicano). */
export function formatearMXN(c: Centavos): string {
  const [entero = '0', dec = '00'] = centavosADecimal(c < 0n ? -c : c).split('.');
  const conComas = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${c < 0n ? '-' : ''}$${conComas}.${dec}`;
}
