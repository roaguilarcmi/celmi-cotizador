/**
 * Lectura de la cotización (corrida) que entrega la financiera en PDF (decisión 2026-10-12). El navegador extrae el
 * texto del PDF (sin subirlo ni guardarlo) y aquí se convierte en los datos de una opción de financiamiento. Cada
 * financiera arma su PDF distinto: por ahora se reconoce el formato de De Lage Landen (DLL). Si no se reconoce, se
 * devuelve null y la opción se captura a mano.
 *
 * Entrada: los textos del PDF en orden (uno por elemento, como los entrega pdf.js); los vacíos se ignoran.
 */

export type FrecuenciaCorrida = 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual';

export interface CorridaFinanciera {
  /** Clave de la financiera para buscarla en el catálogo («dll»). */
  financiera: 'dll';
  /** Nombre como aparece en el PDF, para mostrarlo si no está en el catálogo. */
  nombreFinanciera: string;
  folio: string;
  /** «AAAA-MM-DD». */
  fechaEmision: string | null;
  /** Días de vigencia «a partir de la fecha» (la fecha exacta la calcula quien llama, con su regla). */
  diasVigencia: number | null;
  tipo: 'vjm' | 'fpo' | null;
  plazoMeses: number | null;
  frecuencia: FrecuenciaCorrida | null;
  /** Montos como texto decimal sin separadores («5500.00»). */
  valorEquipos: string | null;
  gastosAdministrativos: string | null;
  seguroEquipo: string | null;
  /** Pago (o renta) de los equipos por periodo. */
  pago: string | null;
  seguro: string | null;
  factor: string | null;
  /** Tasa anual en % («16.37»). */
  tasa: string | null;
  /** Opción de compra (FPO): porcentaje y monto. */
  opcionCompraPct: string | null;
  opcionCompraMonto: string | null;
  /** Campos que no se encontraron (para avisar). */
  faltantes: string[];
}

const DINERO = /^\$\s?([\d,]+\.\d{2})(?:\s?MXN)?(?:\s?\+\s?IVA)?$/i;
const FRECUENCIAS: Record<string, FrecuenciaCorrida> = {
  mensuales: 'mensual',
  bimestrales: 'bimestral',
  trimestrales: 'trimestral',
  semestrales: 'semestral',
  anuales: 'anual',
};

const limpio = (v: string) => v.replace(/\s+/g, ' ').trim();
const dinero = (v: string | undefined) => {
  const m = v ? DINERO.exec(limpio(v)) : null;
  return m?.[1] ? m[1].replaceAll(',', '') : null;
};
/** Decimal sin ceros de más a la derecha («16.370000» → «16.37»). */
const decimal = (v: string) => (v.includes('.') ? v.replace(/0+$/, '').replace(/\.$/, '') : v);

export function leerCorridaFinanciera(textos: readonly string[]): CorridaFinanciera | null {
  const t = textos.map(limpio).filter(Boolean);
  const todo = t.join('\n');
  if (!/De Lage Landen/i.test(todo) || !/Desglose de pagos mensuales/i.test(todo)) return null;

  const indice = (etiqueta: RegExp, desde = 0) => t.findIndex((x, i) => i >= desde && etiqueta.test(x));
  /** Texto inmediato después de una etiqueta. */
  const tras = (etiqueta: RegExp) => {
    const i = indice(etiqueta);
    return i >= 0 ? t[i + 1] : undefined;
  };
  /** Primer monto después de una etiqueta (las celdas vacías ya se quitaron). */
  const montoTras = (etiqueta: RegExp) => {
    const i = indice(etiqueta);
    if (i < 0) return null;
    for (const x of t.slice(i + 1, i + 4)) {
      const m = dinero(x);
      if (m) return m;
    }
    return null;
  };

  const folio = /^Cotización\s*#\s*(\S+)/i.exec(t.find((x) => /^Cotización\s*#/i.test(x)) ?? '')?.[1] ?? '';
  const fecha = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(tras(/^Fecha de cotización$/i) ?? '');
  const plan = tras(/^Plan de Financiamiento$/i) ?? '';
  const tipo = /puro/i.test(plan) ? 'vjm' : /financiero/i.test(plan) ? 'fpo' : null;
  const frecuencia =
    FRECUENCIAS[/^Pagos\s+(\w+)$/i.exec(tras(/^Frecuencia de Pago$/i) ?? '')?.[1]?.toLowerCase() ?? ''];
  const tasa = /^([\d.]+)\s*%$/.exec(tras(/^Tasa de Inter[eé]s$/i) ?? '')?.[1];
  const iOpcion = indice(/^Opción de Compra\s*\(/i);
  const opcionPct = iOpcion >= 0 ? /\(([\d.]+)\s*%\)/.exec(t[iOpcion] ?? '')?.[1] : undefined;
  const opcionMonto = iOpcion >= 0 ? dinero(t[iOpcion + 1]) : null;

  // Tabla «Desglose de pagos mensuales»: encabezados (Plazo, [Factor], Renta|Pago, Seguro) y una fila.
  const iPlazo = indice(/^Plazo$/i);
  const conFactor = iPlazo >= 0 && /^Factor$/i.test(t[iPlazo + 1] ?? '');
  const iFila = indice(/^\d+\s+meses$/i, Math.max(iPlazo, 0));
  const plazoFila = /^(\d+)/.exec(t[iFila] ?? '')?.[1];
  const plazoTabla = plazoFila ? Number(plazoFila) : null;
  const plazoDatos = /^(\d+)\s+Meses$/i.exec(tras(/^Plazo\s*\(Meses\)$/i) ?? '')?.[1];
  let factor: string | null = null;
  let pago: string | null = null;
  let seguro: string | null = null;
  if (iFila >= 0) {
    const celdas = t.slice(iFila + 1, iFila + 4);
    if (conFactor) {
      const primera = celdas[0] ?? '';
      factor = /^\d+\.\d+$/.test(primera) ? primera : null;
      pago = dinero(celdas[1]);
      seguro = dinero(celdas[2]);
    } else {
      pago = dinero(celdas[0]);
      seguro = dinero(celdas[1]);
    }
  }

  const dias = /Vigencia de la propuesta\s+(\d+)\s+d[ií]as/i.exec(todo)?.[1];

  const r: CorridaFinanciera = {
    financiera: 'dll',
    nombreFinanciera: 'De Lage Landen',
    folio,
    fechaEmision: fecha ? `${fecha[3]}-${fecha[2]}-${fecha[1]}` : null,
    diasVigencia: dias ? Number(dias) : null,
    tipo,
    plazoMeses: plazoDatos ? Number(plazoDatos) : plazoTabla,
    frecuencia: frecuencia ?? null,
    valorEquipos: montoTras(/^Valor Total de Equipo\(s\)$/i),
    gastosAdministrativos: montoTras(/^Gastos Administrativos$/i),
    seguroEquipo: montoTras(/^Seguro Equipo$/i),
    pago,
    seguro,
    factor,
    tasa: tasa ? decimal(tasa) : null,
    opcionCompraPct: opcionPct ? decimal(opcionPct) : null,
    opcionCompraMonto: opcionMonto,
    faltantes: [],
  };
  const nombres: [keyof CorridaFinanciera, string][] = [
    ['folio', '# de cotización'],
    ['fechaEmision', 'fecha de cotización'],
    ['tipo', 'plan de financiamiento'],
    ['plazoMeses', 'plazo'],
    ['frecuencia', 'frecuencia de pago'],
    ['gastosAdministrativos', 'gastos administrativos'],
    ['seguroEquipo', 'seguro de equipo'],
    ['pago', 'pago de los equipos'],
    ['seguro', 'seguro mensual'],
  ];
  if (r.tipo === 'fpo') nombres.push(['tasa', 'tasa de interés'], ['opcionCompraMonto', 'opción de compra']);
  r.faltantes = nombres.filter(([k]) => r[k] === null || r[k] === '').map(([, n]) => n);
  return r;
}
