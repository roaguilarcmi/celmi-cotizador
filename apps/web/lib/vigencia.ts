/** Marcador que se sustituye por la fecha de vigencia de la cotización (decisión 2026-10-05). */
export const MARCADOR_VIGENCIA = '{vigencia}';

const fecha = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Mexico_City',
});

/** «30 de septiembre de 2026, 12:30 h» (o un aviso si aún no hay vigencia). */
export const textoVigencia = (iso: string | null) =>
  iso ? `${fecha.format(new Date(iso)).replace(/(\d{1,2}:\d{2}).*$/, '$1')} h` : '[vigencia por definir]';

/** Copia del documento con el marcador sustituido en todos los textos. */
export function conVigencia<T>(doc: T, iso: string | null): T {
  const texto = textoVigencia(iso);
  const recorrer = (n: unknown): unknown => {
    if (Array.isArray(n)) return n.map(recorrer);
    if (n && typeof n === 'object') {
      const o = n as Record<string, unknown>;
      const copia: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(o))
        copia[k] =
          k === 'text' && typeof v === 'string' ? v.replaceAll(MARCADOR_VIGENCIA, texto) : recorrer(v);
      return copia;
    }
    return n;
  };
  return recorrer(doc) as T;
}
