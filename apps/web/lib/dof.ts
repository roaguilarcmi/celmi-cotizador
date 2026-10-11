/**
 * Tipo de cambio del dólar publicado en el Diario Oficial de la Federación (decisión 2026-10-11), del servicio de datos
 * abiertos del DOF (SIDOF, Segob): público, sin clave. Sólo se consulta desde el servidor, a una dirección fija sin
 * datos del usuario; la respuesta se valida y, si el servicio falla, simplemente no se muestra (nunca bloquea).
 * Es una referencia: el T.C. lo sigue fijando quien autoriza.
 */
const SERVICIO = 'https://sidof.segob.gob.mx/dof/sidof/indicadores';
/** «Dólar» en el catálogo de indicadores del SIDOF. */
const INDICADOR_DOLAR = 158;

interface Indicador {
  codTipoIndicador: number;
  fecha: string;
  valor: string;
}

/** Sólo se aceptan registros con la forma esperada (fecha «DD-MM-AAAA» y un decimal razonable). */
const esIndicador = (x: unknown): x is Indicador => {
  const o = x as Partial<Indicador> | null;
  return (
    typeof o?.codTipoIndicador === 'number' &&
    typeof o.fecha === 'string' &&
    /^\d{2}-\d{2}-\d{4}$/.test(o.fecha) &&
    typeof o.valor === 'string' &&
    /^\d{1,3}\.\d{1,6}$/.test(o.valor)
  );
};

export interface TipoCambioDof {
  /** Pesos por dólar, como lo publica el DOF («18.1128»). */
  valor: string;
  /** Fecha de publicación en el DOF («AAAA-MM-DD»). */
  fecha: string;
}

const ddmmaaaa = (d: Date) =>
  new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Mexico_City',
  })
    .format(d)
    .replaceAll('/', '-');

/** El publicado más reciente (busca en los últimos 10 días por fines de semana y días inhábiles). */
export async function tipoCambioDof(): Promise<TipoCambioDof | null> {
  const hoy = new Date();
  const desde = new Date(hoy.getTime() - 10 * 86_400_000);
  try {
    const r = await fetch(`${SERVICIO}/${INDICADOR_DOLAR}/${ddmmaaaa(desde)}/${ddmmaaaa(hoy)}`, {
      // El DOF publica una vez al día: basta con consultarlo cada hora.
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
      headers: { accept: 'application/json' },
    });
    if (!r.ok) return null;
    const lista: unknown = ((await r.json()) as { ListaIndicadores?: unknown } | null)?.ListaIndicadores;
    if (!Array.isArray(lista) || lista.length > 60) return null;
    const ultimo = lista
      .filter(esIndicador)
      .filter((x) => x.codTipoIndicador === INDICADOR_DOLAR)
      .map((x) => {
        const [d, m, a] = x.fecha.split('-');
        return { valor: x.valor, fecha: `${a}-${m}-${d}` };
      })
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .at(-1);
    return ultimo ?? null;
  } catch {
    return null;
  }
}
