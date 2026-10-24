import { bytes, texto, type ArchivosZip } from './zip';

/**
 * Edición mínima de una hoja de Excel (SpreadsheetML) para llenar plantillas (2026-10-23): poner textos, números y
 * fórmulas conservando los estilos de la plantilla, mover filas y ajustar celdas combinadas. Los textos van «en
 * línea» (sin tocar la tabla de textos compartidos) y Excel recalcula las fórmulas al abrir.
 */

const MARCA = '\u0000COMBINADAS\u0000';
/** Elementos que en una hoja van después de <mergeCells>. */
const DESPUES_DE_COMBINADAS =
  /<(phoneticPr|conditionalFormatting|dataValidations|hyperlinks|printOptions|pageMargins|pageSetup|headerFooter|rowBreaks|colBreaks|customProperties|cellWatches|ignoredErrors|smartTags|drawing|legacyDrawing|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b/;

export type Valor = { texto: string } | { numero: string } | { formula: string } | null;

interface Fila {
  /** Atributos de <row> sin `r` ni `spans` (alto, estilo…). */
  attrs: string;
  celdas: Map<number, string>;
}

export const xmlSeguro = (s: string) =>
  s
    // Caracteres de control que XML no admite (deja tabulador y saltos de línea).
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function columna(letras: string): number {
  let n = 0;
  for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
  return n;
}

export function letras(n: number): string {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

export function partir(ref: string): { col: number; fila: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) throw new Error(`Referencia no válida: ${ref}`);
  return { col: columna(m[1] ?? ''), fila: Number(m[2]) };
}

export class Hoja {
  private readonly antes: string;
  private readonly despues: string;
  private readonly filas = new Map<number, Fila>();
  private combinadas: string[];

  constructor(xml: string) {
    const ini = xml.indexOf('<sheetData');
    const finAbre = xml.indexOf('>', ini);
    const autoCerrada = xml[finAbre - 1] === '/';
    const fin = autoCerrada ? finAbre + 1 : xml.indexOf('</sheetData>') + '</sheetData>'.length;
    if (ini < 0 || fin <= ini) throw new Error('La hoja no tiene datos');
    this.antes = xml.slice(0, ini);
    let resto = xml.slice(fin);
    this.combinadas = [...resto.matchAll(/<mergeCell ref="([^"]+)"\s*\/>/g)].map((m) => m[1] ?? '');
    // Las celdas combinadas van en su lugar del esquema (después de sheetProtection, sortState…; antes de
    // dataValidations, pageMargins…): donde estaban o, si no había, antes del primero de esos elementos.
    if (/<mergeCells\b/.test(resto))
      resto = resto.replace(/<mergeCells[^>]*>[\s\S]*?<\/mergeCells>|<mergeCells[^>]*\/>/, MARCA);
    else {
      const m = DESPUES_DE_COMBINADAS.exec(resto);
      resto = m
        ? resto.slice(0, m.index) + MARCA + resto.slice(m.index)
        : resto.replace('</worksheet>', `${MARCA}</worksheet>`);
    }
    this.despues = resto;
    const datos = autoCerrada ? '' : xml.slice(finAbre + 1, xml.indexOf('</sheetData>'));
    for (const m of datos.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const attrs = m[1] ?? '';
      const r = Number(/\br="(\d+)"/.exec(attrs)?.[1]);
      const fila: Fila = {
        attrs: attrs.replace(/\s*\br="\d+"/, '').replace(/\s*\bspans="[^"]*"/, ''),
        celdas: new Map(),
      };
      for (const c of (m[2] ?? '').matchAll(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)) {
        const ref = /\br="([A-Z]+)\d+"/.exec(c[0])?.[1];
        if (ref) fila.celdas.set(columna(ref), c[0]);
      }
      this.filas.set(r, fila);
    }
  }

  /** Estilo (`s`) de una celda de la plantilla, o null. */
  estilo(ref: string): string | null {
    const { col, fila } = partir(ref);
    const c = this.filas.get(fila)?.celdas.get(col);
    return c ? (/\bs="(\d+)"/.exec(c)?.[1] ?? null) : null;
  }

  /** Atributos de la fila (alto, etc.) para copiarlos a otra. */
  atributosFila(n: number): string {
    return this.filas.get(n)?.attrs ?? '';
  }

  private fila(n: number, attrs?: string): Fila {
    let f = this.filas.get(n);
    if (!f) {
      f = { attrs: attrs ?? '', celdas: new Map() };
      this.filas.set(n, f);
    } else if (attrs !== undefined) f.attrs = attrs;
    return f;
  }

  /** Escribe una celda. `estilo` undefined conserva el de la celda actual; null lo quita. */
  poner(ref: string, valor: Valor, estilo?: string | null) {
    const { col, fila } = partir(ref);
    const s = estilo === undefined ? this.estilo(ref) : estilo;
    const sAttr = s ? ` s="${s}"` : '';
    let xml: string;
    if (valor === null) xml = `<c r="${ref}"${sAttr}/>`;
    else if ('texto' in valor)
      xml = `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${xmlSeguro(valor.texto)}</t></is></c>`;
    else if ('numero' in valor) {
      if (!/^-?\d+(\.\d+)?$/.test(valor.numero)) throw new Error('Número no válido');
      xml = `<c r="${ref}"${sAttr}><v>${valor.numero}</v></c>`;
    } else xml = `<c r="${ref}"${sAttr}><f>${xmlSeguro(valor.formula)}</f></c>`;
    this.fila(fila).celdas.set(col, xml);
  }

  /** Borra las filas [desde, hasta] (con sus celdas). */
  quitarFilas(desde: number, hasta = Number.MAX_SAFE_INTEGER) {
    for (const n of [...this.filas.keys()]) if (n >= desde && n <= hasta) this.filas.delete(n);
  }

  /** Crea la fila `n` con esos atributos si no existe; si existe, la deja como está (con sus otras celdas). */
  asegurarFila(n: number, attrs: string) {
    if (!this.filas.has(n)) this.filas.set(n, { attrs, celdas: new Map() });
  }

  /** Crea (o reemplaza) la fila `n` con los atributos indicados. */
  nuevaFila(n: number, attrs: string) {
    this.filas.set(n, { attrs, celdas: new Map() });
  }

  get celdasCombinadas(): readonly string[] {
    return this.combinadas;
  }

  fijarCombinadas(rangos: string[]) {
    this.combinadas = rangos;
  }

  xml(): string {
    let min = { c: Infinity, f: Infinity };
    let max = { c: 0, f: 0 };
    const filas = [...this.filas.entries()].sort((a, b) => a[0] - b[0]);
    const cuerpo = filas
      .map(([n, f]) => {
        const celdas = [...f.celdas.entries()].sort((a, b) => a[0] - b[0]);
        for (const [c] of celdas) {
          min = { c: Math.min(min.c, c), f: Math.min(min.f, n) };
          max = { c: Math.max(max.c, c), f: Math.max(max.f, n) };
        }
        const xmlCeldas = celdas
          .map(([c, x]) => x.replace(/\br="[A-Z]+\d+"/, `r="${letras(c)}${n}"`))
          .join('');
        return `<row r="${n}"${f.attrs ? ` ${f.attrs.trim()}` : ''}>${xmlCeldas}</row>`;
      })
      .join('');
    const dimension = Number.isFinite(min.c) ? `${letras(min.c)}${min.f}:${letras(max.c)}${max.f}` : 'A1';
    const antes = this.antes.replace(/<dimension ref="[^"]*"\s*\/>/, `<dimension ref="${dimension}"/>`);
    const combinadas = this.combinadas.length
      ? `<mergeCells count="${this.combinadas.length}">${this.combinadas.map((r) => `<mergeCell ref="${r}"/>`).join('')}</mergeCells>`
      : '';
    return `${antes}<sheetData>${cuerpo}</sheetData>${this.despues.replace(MARCA, combinadas)}`;
  }
}

/**
 * Deja el libro listo para entregarse: sin cadena de cálculo (Excel la rehace) y con «recalcular al abrir» para que
 * las fórmulas muestren su resultado. Convierte una plantilla (.xltx) en libro normal (.xlsx).
 */
export function prepararLibro(a: ArchivosZip) {
  a.delete('xl/calcChain.xml');
  const relsRuta = 'xl/_rels/workbook.xml.rels';
  a.set(
    relsRuta,
    bytes(texto(a.get(relsRuta)).replace(/<Relationship [^>]*Target="calcChain\.xml"[^>]*\/>/, '')),
  );
  let tipos = texto(a.get('[Content_Types].xml'));
  tipos = tipos
    .replace(/<Override PartName="\/xl\/calcChain\.xml"[^>]*\/>/, '')
    .replace('spreadsheetml.template.main+xml', 'spreadsheetml.sheet.main+xml');
  a.set('[Content_Types].xml', bytes(tipos));
  let libro = texto(a.get('xl/workbook.xml'));
  libro = /<calcPr\b/.test(libro)
    ? libro.replace(
        /<calcPr\b([^>]*?)\s*\/>/,
        (_m, at: string) => `<calcPr${at.replace(/\s*fullCalcOnLoad="[^"]*"/, '')} fullCalcOnLoad="1"/>`,
      )
    : libro.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
  a.set('xl/workbook.xml', bytes(libro));
}
