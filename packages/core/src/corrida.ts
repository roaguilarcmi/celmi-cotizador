import type { Centavos } from './decimal';
import {
  calcularPartida,
  calcularTotales,
  consolidarLinea,
  prorratear,
  totalesConAdicionales,
  type ResultadoPartida,
  type Totales,
} from './precios';

/**
 * Corrida completa de una revisión (Fase 3C): de cada partida interna a las líneas que ve el cliente y los totales
 * de cada propuesta. Reglas 2026-10-05:
 *   · un adicional «incluido» se suma al precio unitario de su partida (una sola línea, misma cantidad);
 *   · un adicional en «línea» propia va justo después de su partida;
 *   · un cargo «prorrateado» no es línea: su importe se reparte entre las partidas elegidas en proporción a su precio
 *     de venta (ya con sus incluidos) y puede quedar una diferencia de centavos por el redondeo del unitario;
 *   · las partidas de propuestas adicionales marcadas «se suma» entran al total de cada propuesta principal.
 */

export type PresentacionPartida = 'linea' | 'incluida' | 'prorrateada';

/** Partida con su precio unitario ya definido (autorizado o calculado). */
export interface PartidaPresentable {
  id: string;
  padreId: string | null;
  presentacion: PresentacionPartida;
  cantidad: number;
  precioUnitario: Centavos;
  seSuma: boolean;
  /** Partidas (de primer nivel y en línea, de la misma propuesta) entre las que se reparte un cargo. */
  prorratearEntre: readonly string[];
}

export interface PropuestaPresentable<
  P extends Omit<PartidaPresentable, 'precioUnitario'> = PartidaPresentable,
> {
  id: string;
  esAdicional: boolean;
  /** En el orden de la cotización (cada adicional puede ir antes o después de su partida). */
  partidas: readonly P[];
}

export interface LineaPresentada {
  /** Partida que da nombre a la línea. */
  partidaId: string;
  /** Adicionales incluidos en su precio. */
  incluidas: string[];
  /** Parte de cargos prorrateados que recibe la línea. */
  cargo: Centavos;
  precioUnitario: Centavos;
  cantidad: number;
  importe: Centavos;
  seSuma: boolean;
}

export interface CargoPresentado {
  partidaId: string;
  importe: Centavos;
  reparto: { destinoId: string; cargo: Centavos }[];
  /** Lo que el redondeo del unitario agrega (+) o quita (−) al cargo. */
  diferencia: Centavos;
}

export interface PropuestaPresentada {
  id: string;
  esAdicional: boolean;
  lineas: LineaPresentada[];
  cargos: CargoPresentado[];
  /** Propuesta principal: con los adicionales que se suman. Adicional: sólo sus líneas. */
  totales: Totales;
}

const precioDe = (p: PartidaPresentable) => ({
  precioUnitario: p.precioUnitario,
  cantidad: p.cantidad,
  importe: p.precioUnitario * BigInt(p.cantidad),
});

function presentarUna(prop: PropuestaPresentable): Omit<PropuestaPresentada, 'totales'> {
  const lineas: LineaPresentada[] = [];
  const porPartida = new Map<string, LineaPresentada>();
  const primerNivel = prop.partidas.filter((p) => p.padreId === null && p.presentacion === 'linea');

  for (const p of primerNivel) {
    const incluidas = prop.partidas.filter((c) => c.padreId === p.id && c.presentacion === 'incluida');
    const l = consolidarLinea([p, ...incluidas]);
    const linea: LineaPresentada = {
      partidaId: p.id,
      incluidas: incluidas.map((c) => c.id),
      cargo: 0n,
      ...l,
      seSuma: p.seSuma,
    };
    lineas.push(linea);
    porPartida.set(p.id, linea);
    for (const c of prop.partidas.filter((x) => x.padreId === p.id && x.presentacion === 'linea')) {
      const visible: LineaPresentada = {
        partidaId: c.id,
        incluidas: [],
        cargo: 0n,
        ...precioDe(c),
        seSuma: c.seSuma,
      };
      lineas.push(visible);
      porPartida.set(c.id, visible);
    }
  }

  // El reparto se hace sobre el precio de cada línea antes de cualquier cargo, así el orden de los cargos no importa.
  const base = new Map(lineas.map((l) => [l.partidaId, { ...l }]));
  const cargos: CargoPresentado[] = [];
  for (const c of prop.partidas.filter((p) => p.presentacion === 'prorrateada')) {
    const destinos = c.prorratearEntre
      .map((id) => base.get(id))
      .filter((l): l is LineaPresentada => l !== undefined);
    if (destinos.length === 0)
      throw new Error('Un cargo prorrateado no tiene partidas entre las que repartirse');
    const importe = c.precioUnitario * BigInt(c.cantidad);
    const r = prorratear(importe, destinos);
    destinos.forEach((d, i) => {
      const linea = porPartida.get(d.partidaId);
      const nueva = r.lineas[i];
      if (!linea || !nueva) return;
      linea.cargo += nueva.cargo;
      linea.precioUnitario += nueva.precioUnitario - d.precioUnitario;
      linea.importe = linea.precioUnitario * BigInt(linea.cantidad);
    });
    cargos.push({
      partidaId: c.id,
      importe,
      reparto: destinos.map((d, i) => ({ destinoId: d.partidaId, cargo: r.lineas[i]?.cargo ?? 0n })),
      diferencia: r.diferencia,
    });
  }
  return { id: prop.id, esAdicional: prop.esAdicional, lineas, cargos };
}

/** Líneas para el cliente y totales de cada propuesta, a partir de los precios unitarios de las partidas. */
export function presentarPropuestas(propuestas: readonly PropuestaPresentable[]): PropuestaPresentada[] {
  const presentadas = propuestas.map(presentarUna);
  const sumadas = presentadas.filter((p) => p.esAdicional).flatMap((p) => p.lineas.filter((l) => l.seSuma));
  return presentadas.map((p) => ({
    ...p,
    totales: p.esAdicional ? calcularTotales(p.lineas) : totalesConAdicionales(p.lineas, sumadas),
  }));
}

/** Partida tal como la ve quien autoriza: costo, tipo de cambio y la utilidad que le asigna. */
export interface PartidaCorrida extends Omit<PartidaPresentable, 'precioUnitario'> {
  costoUnitario: string;
  tipoCambio: string;
  utilidadPct: string;
}

export interface Corrida {
  partidas: Map<string, ResultadoPartida>;
  propuestas: PropuestaPresentada[];
  costo: Centavos;
  /** Suma de los importes de todas las partidas (sin la diferencia de redondeo de los cargos). */
  venta: Centavos;
  utilidad: Centavos;
}

/**
 * Calcula la corrida con la utilidad de cada partida (cada adicional y cada cargo con la suya). Lanza un error si
 * algún dato no es válido (utilidad negativa, cantidad fraccionaria, cargo sin destino…).
 */
export function calcularCorrida(propuestas: readonly PropuestaPresentable<PartidaCorrida>[]): Corrida {
  const partidas = new Map<string, ResultadoPartida>();
  for (const prop of propuestas)
    for (const p of prop.partidas) {
      partidas.set(
        p.id,
        calcularPartida({
          costoUnitario: p.costoUnitario,
          tipoCambio: p.tipoCambio,
          utilidadPct: p.utilidadPct,
          cantidad: p.cantidad,
        }),
      );
    }
  const presentadas = presentarPropuestas(
    propuestas.map((prop) => ({
      ...prop,
      partidas: prop.partidas.map((p) => ({
        ...p,
        precioUnitario: partidas.get(p.id)?.precioUnitario ?? 0n,
      })),
    })),
  );
  let costo = 0n;
  let venta = 0n;
  for (const r of partidas.values()) {
    costo += r.costoTotal;
    venta += r.importe;
  }
  return { partidas, propuestas: presentadas, costo, venta, utilidad: venta - costo };
}
