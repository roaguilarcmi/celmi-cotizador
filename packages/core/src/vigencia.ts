/**
 * Vigencia de una cotización (decisión 2026-10-07): se propone a N días naturales a partir de hoy, siempre a las
 * 14:00 h, y nunca cae en sábado ni domingo (si cae, pasa al lunes siguiente). Las fechas viajan como «AAAA-MM-DD».
 */

export const HORA_VIGENCIA = '14:00';

/** Atajos de vigencia que se ofrecen al capturar la cotización. */
export const ATAJOS_VIGENCIA: readonly { etiqueta: string; dias: number }[] = [
  { etiqueta: '3 días', dias: 3 },
  { etiqueta: '1 semana', dias: 7 },
  { etiqueta: '10 días', dias: 10 },
  { etiqueta: '15 días', dias: 15 },
];

function leer(fecha: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) throw new Error(`Fecha no válida: «${fecha}»`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.toISOString().slice(0, 10) !== fecha) throw new Error(`Fecha no válida: «${fecha}»`);
  return d;
}

const escribir = (d: Date) => d.toISOString().slice(0, 10);

/** true si la fecha es sábado o domingo. */
export function esFinDeSemana(fecha: string): boolean {
  const dia = leer(fecha).getUTCDay();
  return dia === 0 || dia === 6;
}

/** Fecha a `dias` días naturales de `desde`; si cae en fin de semana, el lunes siguiente. */
export function vigenciaSugerida(desde: string, dias: number): string {
  if (!Number.isSafeInteger(dias) || dias < 0) throw new Error('Los días deben ser un entero no negativo');
  const d = leer(desde);
  d.setUTCDate(d.getUTCDate() + dias);
  const semana = d.getUTCDay();
  if (semana === 6) d.setUTCDate(d.getUTCDate() + 2);
  if (semana === 0) d.setUTCDate(d.getUTCDate() + 1);
  return escribir(d);
}

/**
 * Último día hábil del mes de `fecha` (decisión 2026-10-07, «Fin de mes» en la vigencia de la financiera): el día
 * inmediato anterior al mes siguiente; si es sábado o domingo, el viernes anterior (no se pasa al mes siguiente).
 */
export function finDeMesHabil(fecha: string): string {
  const d = leer(fecha);
  const fin = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  const semana = fin.getUTCDay();
  if (semana === 6) fin.setUTCDate(fin.getUTCDate() - 1);
  if (semana === 0) fin.setUTCDate(fin.getUTCDate() - 2);
  return escribir(fin);
}

/** Atajos de vigencia de la cotización de la financiera, desde su fecha de emisión (2026-10-07). */
export const ATAJOS_VIGENCIA_FINANCIERA: readonly { etiqueta: string; dias: number | 'fin_de_mes' }[] = [
  { etiqueta: '15 días', dias: 15 },
  { etiqueta: '30 días', dias: 30 },
  { etiqueta: 'Fin de mes', dias: 'fin_de_mes' },
];
