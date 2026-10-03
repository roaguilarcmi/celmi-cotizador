import type { Centavos } from './decimal';

const HASTA_29 = [
  'CERO',
  'UNO',
  'DOS',
  'TRES',
  'CUATRO',
  'CINCO',
  'SEIS',
  'SIETE',
  'OCHO',
  'NUEVE',
  'DIEZ',
  'ONCE',
  'DOCE',
  'TRECE',
  'CATORCE',
  'QUINCE',
  'DIECISÉIS',
  'DIECISIETE',
  'DIECIOCHO',
  'DIECINUEVE',
  'VEINTE',
  'VEINTIUNO',
  'VEINTIDÓS',
  'VEINTITRÉS',
  'VEINTICUATRO',
  'VEINTICINCO',
  'VEINTISÉIS',
  'VEINTISIETE',
  'VEINTIOCHO',
  'VEINTINUEVE',
];
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = [
  '',
  'CIENTO',
  'DOSCIENTOS',
  'TRESCIENTOS',
  'CUATROCIENTOS',
  'QUINIENTOS',
  'SEISCIENTOS',
  'SETECIENTOS',
  'OCHOCIENTOS',
  'NOVECIENTOS',
];

/** "UNO" → "UN" y "VEINTIUNO" → "VEINTIÚN" delante de MIL, MILLONES o PESOS. */
function apocopar(s: string): string {
  if (s.endsWith('VEINTIUNO')) return `${s.slice(0, -'VEINTIUNO'.length)}VEINTIÚN`;
  if (s.endsWith('UNO')) return `${s.slice(0, -3)}UN`;
  return s;
}

function menorDeMil(n: number): string {
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  const r = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c] ?? '');
  if (r) {
    partes.push(
      r < 30
        ? (HASTA_29[r] ?? '')
        : `${DECENAS[Math.floor(r / 10)]}${r % 10 ? ` Y ${HASTA_29[r % 10]}` : ''}`,
    );
  }
  return partes.join(' ');
}

function menorDeMillon(n: number): string {
  const miles = Math.floor(n / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (miles === 1) partes.push('MIL');
  else if (miles > 1) partes.push(`${apocopar(menorDeMil(miles))} MIL`);
  if (resto) partes.push(menorDeMil(resto));
  return partes.join(' ');
}

/** Número entero en letras, en su forma completa (21 → "VEINTIUNO"). */
export function enteroALetras(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('Se esperaba un entero no negativo');
  if (n >= 1e12) throw new Error('Importe fuera de rango para convertir a letras');
  if (n === 0) return 'CERO';
  const millones = Math.floor(n / 1e6);
  const resto = n % 1e6;
  const partes: string[] = [];
  if (millones === 1) partes.push('UN MILLÓN');
  else if (millones > 1) partes.push(`${apocopar(menorDeMillon(millones))} MILLONES`);
  if (resto) partes.push(menorDeMillon(resto));
  return partes.join(' ');
}

/**
 * Importe en pesos con letra, en el formato de las cotizaciones de CELMI:
 * 3826951n → "TREINTA Y OCHO MIL DOSCIENTOS SESENTA Y NUEVE PESOS 51/100 M.N."
 */
export function importeConLetra(c: Centavos): string {
  if (c < 0n) throw new Error('El importe no puede ser negativo');
  const pesos = Number(c / 100n);
  const cts = (c % 100n).toString().padStart(2, '0');
  const letras = apocopar(enteroALetras(pesos));
  const de = pesos >= 1e6 && pesos % 1e6 === 0 ? ' DE' : '';
  return `${letras}${de} ${pesos === 1 ? 'PESO' : 'PESOS'} ${cts}/100 M.N.`;
}
