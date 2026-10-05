/**
 * «Pegar desde Excel» (Fase 3B): convierte lo que se copia de una hoja (texto separado por tabuladores) en partidas.
 * Sin librerías para leer .xlsx: basta copiar las celdas y pegarlas.
 *
 * Reconoce las columnas por su encabezado (con o sin acentos, en cualquier orden). Si no hay encabezado, asume el
 * orden de la «Solicitud de precios» de CELMI: PARTIDA, SKU, MAYORISTA, MARCA, TIEMPO DE ENTREGA, DESCRIPCIÓN,
 * UNIDAD DE MEDIDA, CANTIDAD, MONEDA, COSTO UNITARIO ANTES DE IVA, VIGENCIA DE PRECIO.
 */

export type CampoPegado =
  | 'partida'
  | 'sku'
  | 'mayorista'
  | 'marca'
  | 'entrega'
  | 'descripcion'
  | 'unidad'
  | 'cantidad'
  | 'moneda'
  | 'costo'
  | 'vigencia'
  | 'tipoCambio';

export interface FilaPegada {
  /** Número de fila en lo pegado (1 = primera fila de datos), para señalar errores. */
  fila: number;
  sku: string;
  /** Texto tal como venía; la pantalla lo empata con el catálogo (p. ej. «INGRAM» → «Ingram Micro»). */
  mayorista: string;
  marca: string;
  entrega: string;
  descripcion: string;
  unidad: string;
  cantidad: number | null;
  moneda: string;
  /** Decimal en texto, sin símbolo ni separadores de miles: «65166.76». */
  costo: string | null;
  /** AAAA-MM-DD o ''. */
  vigencia: string;
  tipoCambio: string | null;
}

export interface ErrorPegado {
  fila: number;
  campo: CampoPegado;
  mensaje: string;
}

export interface ResultadoPegado {
  filas: FilaPegada[];
  errores: ErrorPegado[];
  /** Si se reconoció un encabezado (si no, se asumió el orden de la Solicitud de precios). */
  conEncabezado: boolean;
  /** Encabezados que no se usan (p. ej. «PRECIO MÍNIMO», que se omite por decisión 2026-10-05). */
  ignoradas: string[];
}

const ORDEN_SOLICITUD: CampoPegado[] = [
  'partida',
  'sku',
  'mayorista',
  'marca',
  'entrega',
  'descripcion',
  'unidad',
  'cantidad',
  'moneda',
  'costo',
  'vigencia',
];

const SINONIMOS: Record<CampoPegado, string[]> = {
  partida: ['partida', '#', 'no', 'no.', 'num', 'numero', 'renglon'],
  sku: ['sku', 'numero de parte', 'no. de parte', 'no de parte', 'np', 'modelo', 'codigo', 'clave'],
  mayorista: ['mayorista', 'proveedor', 'distribuidor'],
  marca: ['marca', 'fabricante'],
  entrega: ['tiempo de entrega', 'entrega', 'tiempo entrega', 'plazo de entrega'],
  descripcion: ['descripcion', 'descripcion del equipo', 'descripcion del producto', 'concepto', 'producto'],
  unidad: ['unidad', 'unidad de medida', 'um', 'u.m.', 'medida'],
  cantidad: ['cantidad', 'cant', 'cant.', 'qty', 'piezas'],
  moneda: ['moneda', 'divisa'],
  costo: [
    'costo',
    'costo unitario',
    'costo unitario antes de iva',
    'costo unitario sin iva',
    'costo sin iva',
    'precio unitario',
    'precio',
    'costo de compra',
  ],
  vigencia: ['vigencia', 'vigencia de precio', 'vigencia del precio', 'valido hasta'],
  tipoCambio: ['tipo de cambio', 'tc', 't.c.', 't. c.'],
};

export const normalizar = (texto: string) =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const campoDeEncabezado = (texto: string): CampoPegado | null => {
  const t = normalizar(texto);
  if (!t) return null;
  for (const [campo, nombres] of Object.entries(SINONIMOS) as [CampoPegado, string[]][]) {
    if (nombres.includes(t)) return campo;
  }
  // «Costo unitario antes de IVA (USD)», «Descripción del equipo / servicio»…
  if (t.startsWith('costo')) return 'costo';
  if (t.startsWith('descripcion')) return 'descripcion';
  if (t.startsWith('vigencia')) return 'vigencia';
  return null;
};

/** Celdas de lo pegado. Excel encierra entre comillas las celdas con saltos de línea o tabuladores. */
export function separarCeldas(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = '';
  let entreComillas = false;
  const t = texto.replace(/\r\n?/g, '\n');
  for (let i = 0; i < t.length; i++) {
    const c = t.charAt(i);
    if (entreComillas) {
      if (c === '"' && t[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (c === '"') entreComillas = false;
      else celda += c;
    } else if (c === '"' && celda === '') entreComillas = true;
    else if (c === '\t') {
      fila.push(celda);
      celda = '';
    } else if (c === '\n') {
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = '';
    } else celda += c;
  }
  if (celda !== '' || fila.length) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas.filter((f) => f.some((x) => x.trim() !== ''));
}

/** «$65,166.76» → «65166.76». null si no es un importe válido. */
export function leerImporte(texto: string): string | null {
  const t = texto.replace(/[$\s]/g, '').replace(/^MXN|^USD/i, '');
  if (!/^\d{1,3}(,\d{3})*(\.\d+)?$|^\d+(\.\d+)?$/.test(t)) return null;
  return t.replaceAll(',', '');
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const dos = (n: number) => String(n).padStart(2, '0');

/**
 * «09-oct», «9 oct 2026», «09/10/2026», «2026-10-09» → «2026-10-09». Sin año, se toma el actual; si esa fecha ya pasó
 * hace más de seis meses, el siguiente (una vigencia de precio es siempre próxima).
 */
export function leerFecha(texto: string, hoy = new Date()): string | null {
  const t = normalizar(texto).replace(/\./g, '');
  if (!t) return '';
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, a = '', mes = '', d = ''] = iso;
    return valida(+a, +mes, +d);
  }
  const numerica = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (numerica) {
    const [, d = '', mes = '', a = ''] = numerica;
    return valida(anio(+a), +mes, +d);
  }
  const conMes = t.match(/^(\d{1,2})[\s/-]+([a-z]{3})[a-z]*(?:[\s/-]+(\d{2,4}))?$/);
  if (!conMes) return null;
  const [, d = '', nombreMes = '', a] = conMes;
  const mes = MESES.indexOf(nombreMes) + 1;
  if (!mes) return null;
  if (a) return valida(anio(+a), mes, +d);
  let actual = hoy.getFullYear();
  if (hoy.getTime() - new Date(actual, mes - 1, +d).getTime() > 183 * 86_400_000) actual += 1;
  return valida(actual, mes, +d);
}
const anio = (a: number) => (a < 100 ? 2000 + a : a);
function valida(a: number, mes: number, d: number): string | null {
  const f = new Date(a, mes - 1, d);
  if (f.getFullYear() !== a || f.getMonth() !== mes - 1 || f.getDate() !== d) return null;
  return `${a}-${dos(mes)}-${dos(d)}`;
}

/** Lee lo pegado: encabezados, celdas y errores por fila (no inventa valores: lo dudoso se marca). */
export function leerPegado(texto: string, hoy = new Date()): ResultadoPegado {
  const celdas = separarCeldas(texto);
  const errores: ErrorPegado[] = [];
  if (!celdas.length) return { filas: [], errores, conEncabezado: false, ignoradas: [] };

  const [primera = []] = celdas;
  const encabezado = primera.map(campoDeEncabezado);
  const conEncabezado = encabezado.filter(Boolean).length >= 2;
  const columnas: (CampoPegado | null)[] = conEncabezado ? encabezado : ORDEN_SOLICITUD;
  const ignoradas = conEncabezado
    ? primera.filter((c, i) => c.trim() && !encabezado[i]).map((c) => c.trim())
    : [];
  const datos = conEncabezado ? celdas.slice(1) : celdas;

  const filas = datos.map((fila, i): FilaPegada => {
    const n = i + 1;
    const valor = (campo: CampoPegado) => {
      const j = columnas.indexOf(campo);
      return j >= 0 ? (fila[j] ?? '').replace(/\s+/g, ' ').trim() : '';
    };
    const error = (campo: CampoPegado, mensaje: string) => errores.push({ fila: n, campo, mensaje });

    const descripcion = valor('descripcion');
    if (!descripcion) error('descripcion', 'Falta la descripción');

    const textoCantidad = valor('cantidad').replaceAll(',', '');
    let cantidad: number | null = null;
    if (!textoCantidad) error('cantidad', 'Falta la cantidad');
    else if (!/^\d+$/.test(textoCantidad) || +textoCantidad <= 0)
      error('cantidad', 'La cantidad debe ser un entero mayor que cero');
    else cantidad = +textoCantidad;

    const textoCosto = valor('costo');
    const costo = textoCosto ? leerImporte(textoCosto) : null;
    if (!textoCosto) error('costo', 'Falta el costo');
    else if (costo === null) error('costo', `Costo no válido: «${textoCosto}»`);
    else if (!/^\d+(\.\d{1,2})?$/.test(costo)) error('costo', 'El costo admite máximo 2 decimales');

    const textoVigencia = valor('vigencia');
    const vigencia = leerFecha(textoVigencia, hoy);
    if (vigencia === null) error('vigencia', `Fecha no válida: «${textoVigencia}»`);

    const textoTc = valor('tipoCambio');
    const tipoCambio = textoTc ? leerImporte(textoTc) : null;
    if (textoTc && (tipoCambio === null || !/^\d+(\.\d{1,5})?$/.test(tipoCambio)))
      error('tipoCambio', 'El tipo de cambio admite máximo 5 decimales');

    return {
      fila: n,
      sku: valor('sku'),
      mayorista: valor('mayorista'),
      marca: valor('marca'),
      entrega: valor('entrega'),
      descripcion,
      unidad: valor('unidad'),
      cantidad,
      moneda: (valor('moneda') || 'MXN').toUpperCase(),
      costo,
      vigencia: vigencia ?? '',
      tipoCambio,
    };
  });
  return { filas, errores, conEncabezado, ignoradas };
}

/**
 * Empata un texto con un catálogo por nombre: exacto, luego por inicio o contenido («INGRAM» → «Ingram Micro»).
 * Devuelve null si no hay coincidencia o si es ambigua.
 */
export function empatarCatalogo<T extends { nombre: string }>(
  texto: string,
  catalogo: readonly T[],
): T | null {
  const t = normalizar(texto);
  if (!t) return null;
  const exacto = catalogo.filter((c) => normalizar(c.nombre) === t);
  if (exacto.length === 1) return exacto[0] ?? null;
  const parcial = catalogo.filter((c) => {
    const n = normalizar(c.nombre);
    return n.startsWith(t) || t.startsWith(n) || n.split(' ').includes(t);
  });
  return parcial.length === 1 ? (parcial[0] ?? null) : null;
}
