import { aEscalado, dividirRedondeando, ESCALA_DINERO } from './decimal';

/**
 * Comparación entre dos revisiones de una cotización (Fase 3D). Cada partida copiada a una Rev nueva recuerda de cuál
 * viene (partida_origen_id), así que una partida de la Rev posterior se empata con su antecesora aunque haya varias
 * Rev de por medio (se sigue la cadena de orígenes).
 */

export interface PartidaComparable {
  id: string;
  /** De qué partida de la Rev anterior se copió (null si se capturó en esta Rev). */
  origenId: string | null;
  propuestaId: string;
  sku: string;
  descripcion: string;
  cantidad: number;
  moneda: string;
  /** Costo unitario en su moneda («14533.46»); null si no tiene. */
  costoUnitario: string | null;
  /** Precio unitario autorizado («16495.48»); null si aún no hay. */
  precioUnitario: string | null;
  /** Utilidad autorizada (sólo si quien consulta puede verla). */
  utilidadPct?: string | null;
}

export type TipoCambio = 'igual' | 'modificada' | 'nueva' | 'eliminada';
export type CampoComparado = 'sku' | 'descripcion' | 'cantidad' | 'moneda' | 'costo' | 'precio' | 'utilidad';

export interface FilaComparacion {
  antes: PartidaComparable | null;
  despues: PartidaComparable | null;
  tipo: TipoCambio;
  campos: CampoComparado[];
  /** Variación del costo unitario en % con un decimal («-8.0»), si ambas lo tienen en la misma moneda. */
  variacionCosto: string | null;
  variacionPrecio: string | null;
}

/** Variación porcentual con un decimal: (después − antes) / antes. */
export function variacion(antes: string, despues: string): string | null {
  const a = aEscalado(antes, ESCALA_DINERO);
  const d = aEscalado(despues, ESCALA_DINERO);
  if (a <= 0n) return null;
  const decimas = dividirRedondeando((d - a) * 1000n, a);
  const abs = decimas < 0n ? -decimas : decimas;
  return `${decimas < 0n ? '-' : ''}${abs / 10n}.${abs % 10n}`;
}

const mismoDecimal = (a: string | null | undefined, b: string | null | undefined) =>
  a == null || b == null ? a == b : Number(a) === Number(b);

/**
 * Empata las partidas de `despues` con las de `antes` siguiendo la cadena de orígenes (`origenDe` devuelve el origen
 * de cualquier partida de las revisiones intermedias). Devuelve las filas en el orden de `despues`, con las
 * eliminadas al final.
 */
export function compararPartidas(
  antes: readonly PartidaComparable[],
  despues: readonly PartidaComparable[],
  origenDe: (id: string) => string | null,
): FilaComparacion[] {
  const porId = new Map(antes.map((p) => [p.id, p]));
  const usadas = new Set<string>();
  const ancestro = (p: PartidaComparable) => {
    let id: string | null = p.origenId;
    for (let i = 0; id && i < 100; i++) {
      if (porId.has(id)) return porId.get(id) ?? null;
      id = origenDe(id);
    }
    return null;
  };

  const filas: FilaComparacion[] = despues.map((d) => {
    const a = ancestro(d);
    if (!a || usadas.has(a.id))
      return {
        antes: null,
        despues: d,
        tipo: 'nueva',
        campos: [],
        variacionCosto: null,
        variacionPrecio: null,
      };
    usadas.add(a.id);
    const campos: CampoComparado[] = [];
    if (a.sku !== d.sku) campos.push('sku');
    if (a.descripcion !== d.descripcion) campos.push('descripcion');
    if (a.cantidad !== d.cantidad) campos.push('cantidad');
    if (a.moneda !== d.moneda) campos.push('moneda');
    if (!mismoDecimal(a.costoUnitario, d.costoUnitario)) campos.push('costo');
    if (!mismoDecimal(a.precioUnitario, d.precioUnitario)) campos.push('precio');
    if (
      a.utilidadPct !== undefined &&
      d.utilidadPct !== undefined &&
      !mismoDecimal(a.utilidadPct, d.utilidadPct)
    )
      campos.push('utilidad');
    const costoComparable = a.costoUnitario && d.costoUnitario && a.moneda === d.moneda;
    return {
      antes: a,
      despues: d,
      tipo: campos.length ? 'modificada' : 'igual',
      campos,
      variacionCosto: costoComparable ? variacion(a.costoUnitario ?? '', d.costoUnitario ?? '') : null,
      variacionPrecio:
        a.precioUnitario && d.precioUnitario ? variacion(a.precioUnitario, d.precioUnitario) : null,
    };
  });
  for (const a of antes)
    if (!usadas.has(a.id))
      filas.push({
        antes: a,
        despues: null,
        tipo: 'eliminada',
        campos: [],
        variacionCosto: null,
        variacionPrecio: null,
      });
  return filas;
}
