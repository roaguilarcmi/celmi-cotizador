/**
 * Sufijo de revisión (decisión 2026-10-05): la original no lleva sufijo; luego Rev A … Rev Z y, después de la Z, se
 * recorre otra vez el alfabeto con un número: Rev A1 … Rev Z1, Rev A2…
 *   0 → null · 1 → «A» · 26 → «Z» · 27 → «A1» · 52 → «Z1» · 53 → «A2»
 */
export function sufijoRevision(numero: number): string | null {
  if (!Number.isSafeInteger(numero) || numero < 0) throw new Error('Número de revisión no válido');
  if (numero === 0) return null;
  const letra = String.fromCharCode(65 + ((numero - 1) % 26));
  const vuelta = Math.floor((numero - 1) / 26);
  return vuelta === 0 ? letra : `${letra}${vuelta}`;
}

/** «Original», «Rev A», «Rev A1»… */
export function etiquetaRevision(numero: number): string {
  const s = sufijoRevision(numero);
  return s ? `Rev ${s}` : 'Original';
}
