import { presentarPropuestas, type PartidaPresentable } from './corrida';
import { dividirRedondeando, formatearMXN, type Centavos } from './decimal';
import { calcularTotales, repartir, type Totales } from './precios';

/**
 * Solicitud de corrida financiera (2026-10-23): con los precios autorizados se llena el formato del mayorista del
 * arrendamiento (CT, Ingram o el de CELMI) para pedir la corrida por correo. Aquí viven las reglas; la web arma el
 * Excel. Decisiones de Rodrigo:
 *   · plazos (24/36/48/60) y esquemas se marcan en el paso; CT lleva una hoja por plazo;
 *   · las partidas se presentan como las ve el cliente o desglosadas (se elige);
 *   · el costo va en pesos con el T.C. autorizado, sea del mayorista que sea;
 *   · la categoría (que pide Ingram) se sugiere por la descripción, se corrige y se recuerda por número de parte.
 */

export const PLAZOS_SOLICITUD = [24, 36, 48, 60] as const;
export type EsquemaSolicitud = 'vjm' | 'fpo' | 'credito';
export type PresentacionSolicitud = 'cliente' | 'desglosada';
export type FormatoSolicitud = 'ct' | 'ingram' | 'celmi';

export const ESQUEMAS_SOLICITUD: Record<EsquemaSolicitud, { nombre: string; ct: string; corto: string }> = {
  vjm: { nombre: 'Puro · valor de mercado (VJM)', ct: 'ARRENDAMIENTO VALOR DE MERCADO', corto: 'VJM' },
  fpo: { nombre: 'Financiero · Full Pay Out (FPO)', ct: 'FULL PAY OUT', corto: 'FPO' },
  credito: { nombre: 'Crédito simple', ct: 'CREDITO SIMPLE', corto: 'CREDITO SIMPLE' },
};

// ───────────── Categorías ─────────────

export const CATEGORIAS_PRODUCTO = [
  'Laptop',
  'Desktop',
  'Workstation',
  'Monitor',
  'Tableta',
  'Celular',
  'Impresora',
  'Multifuncional',
  'Servidor',
  'Almacenamiento',
  'Redes',
  'Audio y video',
  'Punto de venta',
  'Accesorio',
  'Licencia',
  'Software',
  'Garantía',
  'Servicio',
  'Otro',
] as const;

/** Palabras que delatan la categoría, en orden de prioridad (garantía antes que laptop: «garantía para laptop»). */
const PISTAS: [RegExp, (typeof CATEGORIAS_PRODUCTO)[number]][] = [
  [
    /\b(garant[ií]a|care ?pack|extensi[oó]n de garant|ampliaci[oó]n de cobertura|cobertura|warranty|soporte en sitio)\b/i,
    'Garantía',
  ],
  [/\b(licencia|license|suscripci[oó]n|subscription|office 365|microsoft 365|m365|antivirus)\b/i, 'Licencia'],
  [/\b(software)\b/i, 'Software'],
  [
    /\b(servicio|instalaci[oó]n|configuraci[oó]n|implementaci[oó]n|capacitaci[oó]n|mano de obra|env[ií]o|flete)\b/i,
    'Servicio',
  ],
  [/\b(workstation|estaci[oó]n de trabajo)\b/i, 'Workstation'],
  [
    /\b(laptop|notebook|port[aá]til|chromebook|ultrabook|macbook|expertbook|thinkpad|latitude|elitebook|probook)\b/i,
    'Laptop',
  ],
  [/\b(desktop|escritorio|all[ -]?in[ -]?one|\baio\b|mini pc|torre|optiplex|thinkcentre|imac)\b/i, 'Desktop'],
  [/\b(monitor|pantalla|display)\b/i, 'Monitor'],
  [/\b(tablet|tableta|ipad|galaxy tab)\b/i, 'Tableta'],
  [/\b(celular|smartphone|tel[eé]fono m[oó]vil|iphone)\b/i, 'Celular'],
  [/\b(multifuncional|mfp|esc[aá]ner|scanner)\b/i, 'Multifuncional'],
  [/\b(impresora|printer|plotter|designjet)\b/i, 'Impresora'],
  [/\b(servidor|server|proliant|poweredge)\b/i, 'Servidor'],
  [/\b(almacenamiento|storage|\bnas\b|\bsan\b|disco duro|\bssd\b|\bhdd\b)\b/i, 'Almacenamiento'],
  [/\b(switch|router|access point|firewall|wifi|wi-fi|redes|networking|ap\b)\b/i, 'Redes'],
  [
    /\b(proyector|bocina|micr[oó]fono|c[aá]mara|webcam|videoconferencia|aud[ií]fonos|headset|diadema)\b/i,
    'Audio y video',
  ],
  [/\b(punto de venta|\bpos\b|lector de c[oó]digo|caj[oó]n de dinero|terminal)\b/i, 'Punto de venta'],
  [
    /\b(mouse|rat[oó]n|teclado|keyboard|mochila|malet[ií]n|funda|base|docking|dock|cargador|adaptador|cable|hub|memoria|ram)\b/i,
    'Accesorio',
  ],
];

/** Categoría sugerida por la descripción (primera línea primero); null si no hay pista. */
export function sugerirCategoria(descripcion: string): (typeof CATEGORIAS_PRODUCTO)[number] | null {
  const lineas = descripcion
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  for (const texto of [lineas[0] ?? '', descripcion])
    for (const [re, c] of PISTAS) if (re.test(texto)) return c;
  return null;
}

export const normalizarSku = (sku: string) => sku.trim().toUpperCase();

// ───────────── Líneas de la solicitud ─────────────

export interface PartidaSolicitud extends PartidaPresentable {
  /** Costo unitario en pesos (con el T.C. autorizado). */
  costoUnitario: Centavos;
}

export interface PropuestaSolicitud {
  id: string;
  esAdicional: boolean;
  partidas: readonly PartidaSolicitud[];
}

export interface LineaSolicitud {
  /** Partida que da nombre a la línea (sus datos: número de parte, descripción, marca…). */
  partidaId: string;
  /** Partidas cuyo costo y precio van dentro de esta línea (incluidos). */
  incluidas: string[];
  cantidad: number;
  costoUnitario: Centavos;
  precioUnitario: Centavos;
  costoTotal: Centavos;
  importe: Centavos;
}

export interface Solicitud {
  lineas: LineaSolicitud[];
  costo: Centavos;
  totales: Totales;
  /** Diferencia del subtotal contra el de la cotización (sólo desglosada, por el redondeo del prorrateo). */
  diferencia: Centavos;
}

/**
 * Líneas de una propuesta principal, con los adicionales que se suman. «cliente»: como en la cotización (incluidos
 * y cargos dentro del precio; el costo de un cargo se reparte igual que su precio). «desglosada»: cada partida,
 * adicional y cargo en su línea con su propio costo y precio.
 */
export function lineasSolicitud(
  propuestas: readonly PropuestaSolicitud[],
  propuestaId: string,
  presentacion: PresentacionSolicitud,
): Solicitud {
  const principal = propuestas.find((p) => p.id === propuestaId);
  if (!principal || principal.esAdicional)
    throw new Error('La solicitud se hace sobre una propuesta principal');
  const presentadas = presentarPropuestas(propuestas);
  const presPrincipal = presentadas.find((p) => p.id === propuestaId);
  if (!presPrincipal) throw new Error('Propuesta no encontrada');
  const partidaDe = new Map(propuestas.flatMap((p) => p.partidas).map((pa) => [pa.id, pa]));
  const costoDe = (id: string) => partidaDe.get(id)?.costoUnitario ?? 0n;

  let lineas: LineaSolicitud[];
  if (presentacion === 'cliente') {
    const sumadas = presentadas.filter((p) => p.esAdicional);
    const bloques = [presPrincipal, ...sumadas];
    lineas = [];
    for (const pres of bloques) {
      const costoCargo = new Map<string, Centavos>();
      for (const c of pres.cargos) {
        const pa = partidaDe.get(c.partidaId);
        const total = (pa?.costoUnitario ?? 0n) * BigInt(pa?.cantidad ?? 0);
        // Igual que su precio; si el precio del cargo fue cero, en partes iguales.
        const pesos = c.reparto.map((r) => (r.cargo > 0n ? r.cargo : 0n));
        const partes = repartir(total, pesos.some((p) => p > 0n) ? pesos : pesos.map(() => 1n));
        c.reparto.forEach((r, i) =>
          costoCargo.set(r.destinoId, (costoCargo.get(r.destinoId) ?? 0n) + (partes[i] ?? 0n)),
        );
      }
      for (const l of pres.lineas) {
        if (pres !== presPrincipal && !l.seSuma) continue;
        const q = BigInt(l.cantidad);
        const base = [l.partidaId, ...l.incluidas].reduce((s, id) => s + costoDe(id), 0n) * q;
        const costoTotal = base + (costoCargo.get(l.partidaId) ?? 0n);
        const costoUnitario = dividirRedondeando(costoTotal, q);
        lineas.push({
          partidaId: l.partidaId,
          incluidas: l.incluidas,
          cantidad: l.cantidad,
          costoUnitario,
          precioUnitario: l.precioUnitario,
          costoTotal: costoUnitario * q,
          importe: l.importe,
        });
      }
    }
  } else {
    const bloques = [principal, ...propuestas.filter((p) => p.esAdicional)];
    lineas = bloques.flatMap((p) =>
      p.partidas
        .filter(
          (pa) => !p.esAdicional || pa.seSuma || (pa.padreId !== null && partidaDe.get(pa.padreId)?.seSuma),
        )
        .map((pa) => ({
          partidaId: pa.id,
          incluidas: [],
          cantidad: pa.cantidad,
          costoUnitario: pa.costoUnitario,
          precioUnitario: pa.precioUnitario,
          costoTotal: pa.costoUnitario * BigInt(pa.cantidad),
          importe: pa.precioUnitario * BigInt(pa.cantidad),
        })),
    );
  }
  const totales = calcularTotales(lineas);
  return {
    lineas,
    costo: lineas.reduce((s, l) => s + l.costoTotal, 0n),
    totales,
    diferencia: totales.subtotal - presPrincipal.totales.subtotal,
  };
}

// ───────────── Textos ─────────────

/** «36 y 48 meses» · «24, 36 y 48 meses». */
export function textoPlazos(plazos: readonly number[]): string {
  const p = [...plazos].sort((a, b) => a - b).map(String);
  return `${p.length > 1 ? `${p.slice(0, -1).join(', ')} y ${p.at(-1) ?? ''}` : (p[0] ?? '')} meses`;
}

export function textoEsquemas(
  esquemas: readonly EsquemaSolicitud[],
  cual: 'nombre' | 'corto' = 'nombre',
): string {
  const t = esquemas.map((e) => ESQUEMAS_SOLICITUD[e][cual]);
  return t.length > 1 ? `${t.slice(0, -1).join(', ')} y ${t.at(-1) ?? ''}` : (t[0] ?? '');
}

/** DD-MM-AAAA en la hora de la Ciudad de México. */
export function fechaArchivo(fecha: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(fecha)
      .map((x) => [x.type, x.value]),
  );
  return `${p.day}-${p.month}-${p.year}`;
}

/** Sin caracteres que Windows no admite en un nombre de archivo. */
const paraArchivo = (s: string) =>
  s
    .replace(/[\\/:*?"<>|\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, 80);

/**
 * Nombre del archivo. CT, con la regla de su plantilla (2026-10-23): «FORMATO CORRIDA FINANCIERA - EMPRESA - ESQUEMA
 * - FECHA». Ingram y CELMI siguen el mismo orden con su propio título.
 */
export function nombreArchivoSolicitud(
  formato: FormatoSolicitud,
  datos: { empresa: string; esquemas: readonly EsquemaSolicitud[]; fecha: Date; propuesta?: string | null },
): string {
  const titulo =
    formato === 'ct'
      ? 'FORMATO CORRIDA FINANCIERA'
      : formato === 'ingram'
        ? 'MIX DE EQUIPO ARRENDAMIENTO'
        : 'SOLICITUD CORRIDA FINANCIERA';
  const esquema = datos.esquemas.map((e) => ESQUEMAS_SOLICITUD[e].corto).join(' Y ');
  const partes = [titulo, paraArchivo(datos.empresa) || 'CLIENTE', esquema, fechaArchivo(datos.fecha)];
  const propuesta = datos.propuesta ? ` (${paraArchivo(datos.propuesta)})` : '';
  return `${partes.join(' - ')}${propuesta}.xlsx`;
}

export interface DatosCorreo {
  empresa: string;
  credito: boolean;
  plazos: readonly number[];
  esquemas: readonly EsquemaSolicitud[];
  propuestas: { nombre: string; subtotal: Centavos }[];
  ejecutivo: { nombre: string; puesto: string; correo: string; telefono: string };
}

/** Asunto y cuerpo del correo para pedir la corrida, con saltos de línea y viñetas (2026-10-23). */
export function textoCorreoSolicitud(d: DatosCorreo): { asunto: string; cuerpo: string } {
  const tipo = d.credito ? 'crédito simple' : 'arrendamiento';
  const asunto = `Solicitud de corrida de ${tipo} · ${d.empresa} · ${textoPlazos(d.plazos)}`;
  const valores =
    d.propuestas.length === 1
      ? [`• Valor de los equipos: ${formatearMXN(d.propuestas[0]?.subtotal ?? 0n)} + IVA`]
      : [
          '• Valor de los equipos:',
          ...d.propuestas.map((p) => `   – ${p.nombre}: ${formatearMXN(p.subtotal)} + IVA`),
        ];
  const firma = [
    d.ejecutivo.nombre,
    [d.ejecutivo.puesto, 'CELMI Solutions'].filter(Boolean).join(' · '),
    d.ejecutivo.telefono,
    d.ejecutivo.correo,
  ].filter(Boolean);
  const cuerpo = [
    'Buen día:',
    '',
    `Les solicitamos la corrida financiera de ${tipo} con los siguientes datos:`,
    '',
    `• Cliente (usuario final): ${d.empresa}`,
    `• Plazos: ${textoPlazos(d.plazos)}`,
    ...(d.credito ? [] : [`• Esquemas: ${textoEsquemas(d.esquemas)}`]),
    '• Moneda: moneda nacional (MXN)',
    ...valores,
    '',
    `Adjuntamos el formato con el detalle de los equipos${d.propuestas.length > 1 ? ' (un archivo por propuesta)' : ''}.`,
    '',
    'Por cada plazo y esquema, les agradeceremos indicarnos:',
    '',
    '• Renta o pago mensual',
    '• Seguro',
    '• Gastos administrativos y seguro de equipo',
    '• Tasa y factor',
    ...(d.credito ? [] : ['• Opción de compra o valor residual']),
    '• Vigencia de la cotización',
    '',
    'Quedamos atentos. Saludos cordiales.',
    '',
    ...firma,
  ].join('\n');
  return { asunto, cuerpo };
}
