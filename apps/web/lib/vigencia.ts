/** Marcador que se sustituye por la fecha de vigencia de la cotización (decisión 2026-10-05). */
export const MARCADOR_VIGENCIA = '{vigencia}';

const fecha = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  // 24 horas: sin esto sale «02:00» para las 14:00 (se quitaba el «p. m.»).
  hourCycle: 'h23',
  timeZone: 'America/Mexico_City',
});

/** «30 de septiembre de 2026, 12:30 h» (o un aviso si aún no hay vigencia). */
export const textoVigencia = (iso: string | null) =>
  iso ? `${fecha.format(new Date(iso)).replace(/(\d{1,2}:\d{2}).*$/, '$1')} h` : '[vigencia por definir]';

const dos = (n: number) => String(n).padStart(2, '0');

/** «AAAA-MM-DDTHH:mm» en la hora local del navegador (para capturar fecha y hora por separado). */
export const aLocal = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`;
};

/** Hoy en el calendario del navegador («AAAA-MM-DD»). */
export const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
};

/** Copia del documento con el marcador sustituido en todos los textos (por la vigencia o por `reemplazo`). */
export function conVigencia<T>(doc: T, iso: string | null, reemplazo?: string): T {
  const texto = reemplazo ?? textoVigencia(iso);
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
