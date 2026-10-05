/** Copia de `xs` con el elemento en `desde` movido a `hasta` (índices fuera de rango se ajustan). */
export function mover<T>(xs: readonly T[], desde: number, hasta: number): T[] {
  const copia = [...xs];
  const destino = Math.max(0, Math.min(copia.length - 1, hasta));
  const [x] = copia.splice(desde, 1);
  if (x === undefined) return copia;
  copia.splice(destino, 0, x);
  return copia;
}
