import {
  aEscalado,
  dividirRedondeando,
  ESCALA_DINERO,
  ESCALA_PORCENTAJE,
  ESCALA_TIPO_CAMBIO,
  type Centavos,
} from './decimal';

const UNO_TC = 10n ** BigInt(ESCALA_TIPO_CAMBIO);
const CIEN_POR_CIENTO = 100n * 10n ** BigInt(ESCALA_PORCENTAJE);

export interface EntradaPrecio {
  /** Costo unitario antes de IVA en la moneda original, p. ej. "14533.46". */
  costoUnitario: string;
  /** Tipo de cambio a MXN. "1" (por omisión) para partidas en pesos. */
  tipoCambio?: string;
  /** Utilidad sobre el costo, en porcentaje: "13.5" = 13.5 %. */
  utilidadPct: string;
}

export interface EntradaPartida extends EntradaPrecio {
  /** Cantidad entera positiva (regla 2026-10-05: no hay cantidades fraccionarias). */
  cantidad: number;
}

export interface ResultadoPartida {
  /** Costo unitario convertido a MXN, redondeado a centavos sólo para mostrarse. */
  costoUnitarioMXN: Centavos;
  precioUnitario: Centavos;
  cantidad: number;
  costoTotal: Centavos;
  /** Precio unitario × cantidad. */
  importe: Centavos;
  utilidadUnitaria: Centavos;
  utilidadTotal: Centavos;
}

function leerEntrada({ costoUnitario, tipoCambio = '1', utilidadPct }: EntradaPrecio) {
  const costo = aEscalado(costoUnitario, ESCALA_DINERO);
  const tc = aEscalado(tipoCambio, ESCALA_TIPO_CAMBIO);
  const pct = aEscalado(utilidadPct, ESCALA_PORCENTAJE);
  if (costo < 0n) throw new Error('El costo no puede ser negativo');
  if (tc <= 0n) throw new Error('El tipo de cambio debe ser mayor que cero');
  // Regla 2026-10-05: no se vende con utilidad negativa.
  if (pct < 0n) throw new Error('La utilidad no puede ser negativa');
  return { costo, tc, pct };
}

/**
 * Regla confirmada por CELMI (2026-10-02) y verificada contra la cotización EPOXEMEX:
 *   precio unitario = costo × tipo de cambio × (1 + utilidad %), redondeado a centavos (mitad hacia arriba).
 * El costo convertido no se redondea antes de aplicar la utilidad (así calcula la corrida en Excel).
 */
export function precioUnitario(entrada: EntradaPrecio): Centavos {
  const { costo, tc, pct } = leerEntrada(entrada);
  return dividirRedondeando(costo * tc * (CIEN_POR_CIENTO + pct), UNO_TC * CIEN_POR_CIENTO);
}

export function calcularPartida(entrada: EntradaPartida): ResultadoPartida {
  const { cantidad } = entrada;
  if (!Number.isSafeInteger(cantidad) || cantidad <= 0) {
    throw new Error('La cantidad debe ser un entero positivo');
  }
  const { costo, tc } = leerEntrada(entrada);
  const q = BigInt(cantidad);
  const pu = precioUnitario(entrada);
  const costoUnitarioMXN = dividirRedondeando(costo * tc, UNO_TC);
  const costoTotal = dividirRedondeando(costo * tc * q, UNO_TC);
  // Primero se redondea el precio unitario y después se multiplica por la cantidad.
  const importe = pu * q;
  return {
    costoUnitarioMXN,
    precioUnitario: pu,
    cantidad,
    costoTotal,
    importe,
    utilidadUnitaria: pu - costoUnitarioMXN,
    utilidadTotal: importe - costoTotal,
  };
}

export interface MejoraDePrecio {
  /** Lo que bajó el costo unitario (negativo si subió). */
  ahorro: Centavos;
  /** Porcentaje respecto al precio anterior, con un decimal: "24.7". */
  porcentaje: string;
}

/**
 * Compara el costo unitario actual con el «precio anterior» (aclaración de CELMI, 2026-10-03:
 * lo usual es obtener una mejora de precio, no cambiar de mayorista).
 */
export function mejoraDePrecio(anterior: string, actual: string): MejoraDePrecio {
  const a = aEscalado(anterior, ESCALA_DINERO);
  const b = aEscalado(actual, ESCALA_DINERO);
  if (a <= 0n) throw new Error('El precio anterior debe ser mayor que cero');
  const ahorro = a - b;
  const decimas = dividirRedondeando(ahorro * 1000n, a);
  const abs = decimas < 0n ? -decimas : decimas;
  return { ahorro, porcentaje: `${decimas < 0n ? '-' : ''}${abs / 10n}.${abs % 10n}` };
}

export interface LineaCliente {
  precioUnitario: Centavos;
  cantidad: number;
  importe: Centavos;
}

/**
 * Varias partidas internas presentadas al cliente como una sola línea
 * (p. ej. SSD + servicio de instalación). El precio unitario visible es la suma de los
 * precios unitarios ya redondeados. Exige la misma cantidad en todas las partidas.
 */
export function consolidarLinea(partidas: readonly ResultadoPartida[]): LineaCliente {
  const [primera] = partidas;
  if (!primera) throw new Error('Se requiere al menos una partida para consolidar');
  if (partidas.some((p) => p.cantidad !== primera.cantidad)) {
    throw new Error('Sólo se pueden consolidar partidas con la misma cantidad');
  }
  const pu = partidas.reduce((s, p) => s + p.precioUnitario, 0n);
  return { precioUnitario: pu, cantidad: primera.cantidad, importe: pu * BigInt(primera.cantidad) };
}

export interface Totales {
  subtotal: Centavos;
  iva: Centavos;
  total: Centavos;
}

/** Tasa de IVA confirmada: 16 %, aplicada sobre el subtotal de cada propuesta. */
export const TASA_IVA_GENERAL = '16';

/**
 * Monto con IVA de una columna informativa (como «Costo compra con IVA» de la corrida), redondeado a centavos.
 * El IVA que se cobra al cliente se calcula sobre el subtotal de la propuesta con `calcularTotales`.
 */
export function conIva(c: Centavos, tasaIvaPct: string = TASA_IVA_GENERAL): Centavos {
  const tasa = aEscalado(tasaIvaPct, ESCALA_PORCENTAJE);
  return dividirRedondeando(c * (CIEN_POR_CIENTO + tasa), CIEN_POR_CIENTO);
}

/**
 * Totales de una propuesta principal con los adicionales que el ejecutivo marcó para sumarse (regla 2026-10-05:
 * se elige por partida). Las partidas sumadas entran al subtotal, así que el IVA se calcula sobre todo junto.
 */
export function totalesConAdicionales(
  principal: readonly { importe: Centavos }[],
  adicionalesSumados: readonly { importe: Centavos }[],
  tasaIvaPct: string = TASA_IVA_GENERAL,
): Totales {
  return calcularTotales([...principal, ...adicionalesSumados], tasaIvaPct);
}

/**
 * «Monto cotizado» del dashboard (regla 2026-10-02): la propuesta de menor total, ya con los adicionales sumados.
 * `null` si no hay propuestas principales.
 */
export function menorMonto(
  principales: readonly (readonly { importe: Centavos }[])[],
  adicionalesSumados: readonly { importe: Centavos }[] = [],
): Centavos | null {
  let menor: Centavos | null = null;
  for (const lineas of principales) {
    const { total } = totalesConAdicionales(lineas, adicionalesSumados);
    if (menor === null || total < menor) menor = total;
  }
  return menor;
}

export function calcularTotales(
  lineas: readonly { importe: Centavos }[],
  tasaIvaPct: string = TASA_IVA_GENERAL,
): Totales {
  const subtotal = lineas.reduce((s, l) => s + l.importe, 0n);
  const tasa = aEscalado(tasaIvaPct, ESCALA_PORCENTAJE);
  if (tasa < 0n) throw new Error('La tasa de IVA no puede ser negativa');
  const iva = dividirRedondeando(subtotal * tasa, CIEN_POR_CIENTO);
  return { subtotal, iva, total: subtotal + iva };
}
