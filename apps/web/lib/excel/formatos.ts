import { ESQUEMAS_SOLICITUD, textoEsquemas, textoPlazos, type EsquemaSolicitud } from '@celmi/core';
import { Hoja, partir, prepararLibro, xmlSeguro, type Valor } from './hoja';
import { PLANTILLA_CT, PLANTILLA_INGRAM } from './plantillas.generado';
import { bytes, escribirZip, leerZip, texto, type ArchivosZip } from './zip';

/**
 * Formatos para pedir la corrida financiera (2026-10-23): CT e Ingram con su plantilla original (sólo se llenan
 * celdas) y el formato propio de CELMI para los demás mayoristas. Importes en pesos, como texto decimal.
 */

export interface LineaExcel {
  parte: string;
  marca: string;
  descripcion: string;
  categoria: string;
  cantidad: number;
  /** «12345.67» */
  costoUnitario: string;
  precioUnitario: string;
}

export interface DatosExcel {
  empresa: string;
  rfc: string;
  estadoEntrega: string;
  proyecto: string;
  propuesta: string;
  cotizacion: string;
  mayorista: string;
  plazos: number[];
  esquemas: EsquemaSolicitud[];
  lineas: LineaExcel[];
  ejecutivo: { nombre: string; puesto: string; correo: string; telefono: string };
  fecha: Date;
}

const CANAL = 'CELMILENIUM S.A. DE C.V. (CELMI Solutions)';
const t = (s: string): Valor => ({ texto: s });
const n = (s: string | number): Valor => ({ numero: String(s) });
const f = (s: string): Valor => ({ formula: s });

const desdeBase64 = (b: string) => new Uint8Array(Buffer.from(b, 'base64'));

/** Estilos de cada columna de una fila de la plantilla (para repetirla). */
function estilosFila(h: Hoja, fila: number, columnas: string[]) {
  return {
    attrs: h.atributosFila(fila),
    s: Object.fromEntries(columnas.map((c) => [c, h.estilo(`${c}${fila}`)])) as Record<string, string | null>,
  };
}

/** Pone una fila con el formato de la de la plantilla, sin borrar otras celdas que ya tenga esa fila. */
function filaComo(
  h: Hoja,
  r: number,
  molde: { attrs: string; s: Record<string, string | null> },
  valores: Record<string, Valor>,
) {
  h.asegurarFila(r, molde.attrs);
  for (const [c, s] of Object.entries(molde.s)) {
    // Una columna sin formato ni valor en la plantilla no se crea.
    if (s === null && valores[c] === undefined) continue;
    h.poner(`${c}${r}`, valores[c] ?? null, s);
  }
}

// ───────────── CT: una hoja por plazo ─────────────

function hojaCt(xml: string, d: DatosExcel, plazo: number): string {
  const h = new Hoja(xml);
  const cols = ['B', 'C', 'D', 'E', 'F', 'G', 'P', 'Q'];
  const producto = estilosFila(h, 17, cols);
  const totales = [18, 19, 20].map((r) => estilosFila(h, r, cols));
  h.poner('D7', t(d.empresa.toUpperCase()));
  h.poner('D11', t(ESQUEMAS_SOLICITUD[d.esquemas[0] ?? 'vjm'].ct));
  h.poner('D12', d.esquemas[1] ? t(ESQUEMAS_SOLICITUD[d.esquemas[1]].ct) : null);
  h.poner('D13', n(plazo));
  h.poner('D14', t('MONEDA NACIONAL'));
  h.quitarFilas(17, 20);
  const primera = 17;
  d.lineas.forEach((l, i) => {
    const r = primera + i;
    filaComo(h, r, producto, {
      B: n(l.costoUnitario),
      C: n(l.cantidad),
      D: t(l.parte),
      E: t(l.descripcion),
      F: n(l.precioUnitario),
      G: f(`F${r}*C${r}`),
    });
  });
  const ultima = primera + d.lineas.length - 1;
  const tr = ultima + 1;
  filaComo(h, tr, totales[0]!, { F: t('SUBTOTAL'), G: f(`SUM(G${primera}:G${ultima})`) });
  filaComo(h, tr + 1, totales[1]!, { F: t('IVA'), G: f(`G${tr}*0.16`) });
  filaComo(h, tr + 2, totales[2]!, { F: t('TOTAL'), G: f(`G${tr}*1.16`) });
  return h.xml();
}

export function excelCt(d: DatosExcel): Uint8Array {
  const a = leerZip(desdeBase64(PLANTILLA_CT));
  prepararLibro(a);
  const base = texto(a.get('xl/worksheets/sheet1.xml'));
  const relsHoja = texto(a.get('xl/worksheets/_rels/sheet1.xml.rels'));
  const dibujo = a.get('xl/drawings/drawing1.xml');
  const relsDibujo = a.get('xl/drawings/_rels/drawing1.xml.rels');
  const impresora = a.get('xl/printerSettings/printerSettings1.bin');
  const plazos = [...d.plazos].sort((x, y) => x - y);
  let libro = texto(a.get('xl/workbook.xml'));
  let relsLibro = texto(a.get('xl/_rels/workbook.xml.rels'));
  let tipos = texto(a.get('[Content_Types].xml'));
  const nombres: string[] = [];
  const hojas: string[] = [];

  plazos.forEach((plazo, i) => {
    const k = i + 1;
    const nombre = `${plazo} meses`;
    nombres.push(nombre);
    let xml = hojaCt(base, d, plazo);
    if (k > 1) {
      xml = xml.replace(/\s*tabSelected="1"/, '');
      a.set(
        `xl/worksheets/_rels/sheet${k}.xml.rels`,
        bytes(
          relsHoja
            .replace('drawing1.xml', `drawing${k}.xml`)
            .replace('printerSettings1.bin', `printerSettings${k}.bin`),
        ),
      );
      if (dibujo) a.set(`xl/drawings/drawing${k}.xml`, dibujo);
      if (relsDibujo) a.set(`xl/drawings/_rels/drawing${k}.xml.rels`, relsDibujo);
      if (impresora) a.set(`xl/printerSettings/printerSettings${k}.bin`, impresora);
      relsLibro = relsLibro.replace(
        '</Relationships>',
        `<Relationship Id="rIdHoja${k}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${k}.xml"/></Relationships>`,
      );
      tipos = tipos.replace(
        '</Types>',
        `<Override PartName="/xl/worksheets/sheet${k}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
          `<Override PartName="/xl/drawings/drawing${k}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`,
      );
      hojas.push(`<sheet name="${nombre}" sheetId="${k + 100}" r:id="rIdHoja${k}"/>`);
    }
    a.set(`xl/worksheets/sheet${k}.xml`, bytes(xml));
  });
  libro = libro
    .replace(/(<sheet [^>]*?name=")[^"]*(")/, `$1${nombres[0] ?? 'Hoja1'}$2`)
    .replace('</sheets>', `${hojas.join('')}</sheets>`);
  a.set('xl/workbook.xml', bytes(libro));
  a.set('xl/_rels/workbook.xml.rels', bytes(relsLibro));
  a.set('[Content_Types].xml', bytes(tipos));
  actualizarTitulos(a, nombres);
  return escribirZip(a);
}

/** Nombres de las hojas en las propiedades del documento (lo que muestra el Explorador de Windows). */
function actualizarTitulos(a: ArchivosZip, nombres: string[]) {
  const app = texto(a.get('docProps/app.xml'));
  if (!app) return;
  a.set(
    'docProps/app.xml',
    bytes(
      app
        .replace(
          /(<vt:lpstr>Hojas de cálculo<\/vt:lpstr><\/vt:variant><vt:variant><vt:i4>)\d+/,
          `$1${nombres.length}`,
        )
        .replace(
          /<TitlesOfParts>[\s\S]*?<\/TitlesOfParts>/,
          `<TitlesOfParts><vt:vector size="${nombres.length}" baseType="lpstr">${nombres
            .map((x) => `<vt:lpstr>${xmlSeguro(x)}</vt:lpstr>`)
            .join('')}</vt:vector></TitlesOfParts>`,
        ),
    ),
  );
}

// ───────────── Ingram ─────────────

const ESQUEMA_INGRAM: Record<EsquemaSolicitud, string> = {
  vjm: 'FMV',
  fpo: 'FPO',
  credito: 'Crédito simple',
};

export function excelIngram(d: DatosExcel): Uint8Array {
  const a = leerZip(desdeBase64(PLANTILLA_INGRAM));
  prepararLibro(a);
  const h = new Hoja(texto(a.get('xl/worksheets/sheet1.xml')));
  const cols = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  const producto = estilosFila(h, 10, cols);
  const totales = estilosFila(h, 26, cols);
  const comision = estilosFila(h, 27, cols);
  h.poner('C2', t(d.empresa.toUpperCase()));
  h.poner('C3', t(CANAL));
  h.poner('C4', t(textoPlazos(d.plazos)));
  h.poner('C5', t(d.esquemas.map((e) => ESQUEMA_INGRAM[e]).join(' y ')));
  h.poner('C6', t('MXN'));
  h.quitarFilas(10, 40);
  const primera = 10;
  d.lineas.forEach((l, i) => {
    const r = primera + i;
    filaComo(h, r, producto, {
      B: null,
      C: t(l.parte),
      D: t(l.descripcion),
      E: n(l.cantidad),
      F: t(l.categoria),
      G: n(l.costoUnitario),
      H: f(`G${r}*E${r}`),
      I: n(l.precioUnitario),
      J: f(`I${r}*E${r}`),
    });
  });
  const ultima = primera + d.lineas.length - 1;
  const tr = ultima + 1;
  filaComo(h, tr, totales, {
    B: t('TOTALES:   '),
    H: f(`SUM(H${primera}:H${ultima})`),
    J: f(`SUM(J${primera}:J${ultima})`),
  });
  filaComo(h, tr + 1, comision, { G: t('Comisión para el canal: '), I: f(`J${tr}-H${tr}`) });
  h.fijarCombinadas([
    ...h.celdasCombinadas.filter((r) => partir(r.split(':')[0] ?? 'A1').fila < primera),
    `B${tr}:G${tr}`,
    `G${tr + 1}:H${tr + 1}`,
  ]);
  // Columnas de importes más anchas: los totales de varios cientos de miles no caben en las de la plantilla.
  a.set('xl/worksheets/sheet1.xml', bytes(h.xml().replace(/(<col min="7" max="10" width=")[\d.]+/, '$122')));
  return escribirZip(a);
}

// ───────────── Formato propio de CELMI ─────────────

const FECHA_LARGA = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** Estilos del formato de CELMI (índices de cellXfs). */
const E = {
  normal: 0,
  titulo: 1,
  subtitulo: 2,
  etiqueta: 3,
  valor: 4,
  encabezado: 5,
  texto: 6,
  cantidad: 7,
  moneda: 8,
  totalEtiqueta: 9,
  totalMoneda: 10,
  notaTitulo: 11,
  nota: 12,
  fecha: 13,
} as const;

const ESTILOS_CELMI = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/></numFmts>
<fonts count="5">
<font><sz val="10"/><color rgb="FF222222"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="FF222222"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="5">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF29235C"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF2F3F8"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF0064EC"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFD4D7E3"/></left><right style="thin"><color rgb="FFD4D7E3"/></right><top style="thin"><color rgb="FFD4D7E3"/></top><bottom style="thin"><color rgb="FFD4D7E3"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="14">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="164" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="right" vertical="center" indent="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

export function excelCelmi(d: DatosExcel): Uint8Array {
  const filas = new Map<number, { alto?: number; celdas: string[] }>();
  const poner = (ref: string, v: Valor, s: number) => {
    const { fila } = partir(ref);
    const x = filas.get(fila) ?? { celdas: [] };
    const sAttr = s ? ` s="${s}"` : '';
    x.celdas.push(
      v === null
        ? `<c r="${ref}"${sAttr}/>`
        : 'texto' in v
          ? `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${xmlSeguro(v.texto)}</t></is></c>`
          : 'numero' in v
            ? `<c r="${ref}"${sAttr}><v>${v.numero}</v></c>`
            : `<c r="${ref}"${sAttr}><f>${xmlSeguro(v.formula)}</f></c>`,
    );
    filas.set(fila, x);
  };
  const alto = (fila: number, pt: number) =>
    filas.set(fila, { ...(filas.get(fila) ?? { celdas: [] }), alto: pt });
  const combinadas: string[] = [];
  const credito = d.esquemas.includes('credito');

  // Encabezado
  alto(1, 30);
  poner('A1', t('CELMI SOLUTIONS'), E.titulo);
  for (const c of 'BCDEFGHIJ') poner(`${c}1`, null, E.titulo);
  combinadas.push('A1:J1');
  poner(
    'A2',
    t(`Solicitud de corrida financiera de ${credito ? 'crédito simple' : 'arrendamiento'}`),
    E.subtitulo,
  );
  for (const c of 'BCDEF') poner(`${c}2`, null, E.subtitulo);
  poner('G2', t(`Fecha: ${FECHA_LARGA.format(d.fecha)}`), E.fecha);
  for (const c of 'HIJ') poner(`${c}2`, null, E.fecha);
  combinadas.push('A2:F2', 'G2:J2');

  // Datos del proyecto y de la solicitud
  const izquierda: [string, string][] = [
    ['Usuario final', d.empresa],
    ['RFC', d.rfc || '—'],
    ['Estado de entrega', d.estadoEntrega || '—'],
    ['Proyecto', d.proyecto],
    ['Propuesta', d.propuesta],
    ['Cotización', d.cotizacion],
  ];
  const derecha: [string, string][] = [
    ['Canal', CANAL],
    ['Mayorista', d.mayorista || '—'],
    ['Plazos', textoPlazos(d.plazos)],
    ['Esquemas', textoEsquemas(d.esquemas)],
    ['Moneda', 'Moneda nacional (MXN)'],
    ['Frecuencia', 'Mensual'],
  ];
  izquierda.forEach(([k, v], i) => {
    const r = 4 + i;
    poner(`A${r}`, t(k), E.etiqueta);
    poner(`B${r}`, null, E.etiqueta);
    poner(`C${r}`, t(v), E.valor);
    for (const c of 'DE') poner(`${c}${r}`, null, E.valor);
    combinadas.push(`A${r}:B${r}`, `C${r}:E${r}`);
    const [k2, v2] = derecha[i] ?? ['', ''];
    poner(`F${r}`, t(k2), E.etiqueta);
    poner(`G${r}`, null, E.etiqueta);
    poner(`H${r}`, t(v2), E.valor);
    for (const c of 'IJ') poner(`${c}${r}`, null, E.valor);
    combinadas.push(`F${r}:G${r}`, `H${r}:J${r}`);
  });

  // Partidas
  const enc = 11;
  alto(enc, 30);
  [
    '#',
    'No. de parte',
    'Marca',
    'Descripción',
    'Categoría',
    'Cant.',
    'Costo unitario',
    'Costo total',
    'Precio unitario',
    'Precio total',
  ].forEach((h, i) => poner(`${'ABCDEFGHIJ'[i]}${enc}`, t(h), E.encabezado));
  const primera = enc + 1;
  d.lineas.forEach((l, i) => {
    const r = primera + i;
    poner(`A${r}`, n(i + 1), E.cantidad);
    poner(`B${r}`, t(l.parte), E.texto);
    poner(`C${r}`, t(l.marca), E.texto);
    poner(`D${r}`, t(l.descripcion), E.texto);
    poner(`E${r}`, t(l.categoria), E.texto);
    poner(`F${r}`, n(l.cantidad), E.cantidad);
    poner(`G${r}`, n(l.costoUnitario), E.moneda);
    poner(`H${r}`, f(`G${r}*F${r}`), E.moneda);
    poner(`I${r}`, n(l.precioUnitario), E.moneda);
    poner(`J${r}`, f(`I${r}*F${r}`), E.moneda);
  });
  const ultima = primera + d.lineas.length - 1;
  const st = ultima + 1;
  const sumas: [string, (c: string) => string][] = [
    ['Subtotal', (c) => `SUM(${c}${primera}:${c}${ultima})`],
    ['IVA 16 %', (c) => `ROUND(${c}${st}*0.16,2)`],
    ['Total', (c) => `${c}${st}+${c}${st + 1}`],
  ];
  sumas.forEach(([etiqueta, formula], i) => {
    const r = st + i;
    poner(`G${r}`, t(etiqueta), E.totalEtiqueta);
    poner(`H${r}`, f(formula('H')), E.totalMoneda);
    poner(`J${r}`, f(formula('J')), E.totalMoneda);
  });

  // Lo que se pide de regreso y el contacto
  const nt = st + 4;
  poner(`A${nt}`, t('Se solicita por cada plazo y esquema:'), E.notaTitulo);
  combinadas.push(`A${nt}:E${nt}`);
  const pedido = [
    'Renta o pago mensual',
    'Seguro',
    'Gastos administrativos y seguro de equipo',
    'Tasa y factor',
    ...(credito ? [] : ['Opción de compra o valor residual']),
    'Vigencia de la cotización',
  ];
  pedido.forEach((p, i) => {
    poner(`A${nt + 1 + i}`, t(`•  ${p}`), E.nota);
    combinadas.push(`A${nt + 1 + i}:E${nt + 1 + i}`);
  });
  poner(`G${nt}`, t('Contacto CELMI'), E.notaTitulo);
  combinadas.push(`G${nt}:J${nt}`);
  [d.ejecutivo.nombre, d.ejecutivo.puesto, d.ejecutivo.correo, d.ejecutivo.telefono]
    .filter(Boolean)
    .forEach((x, i) => {
      poner(`G${nt + 1 + i}`, t(x), E.nota);
      combinadas.push(`G${nt + 1 + i}:J${nt + 1 + i}`);
    });

  const anchos = [5, 20, 14, 60, 16, 8, 15, 16, 15, 16];
  const cols = anchos
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('');
  const datos = [...filas.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([r, x]) => {
      const celdas = x.celdas.sort(
        (a, b) =>
          partir(/r="([A-Z]+\d+)"/.exec(a)?.[1] ?? 'A1').col -
          partir(/r="([A-Z]+\d+)"/.exec(b)?.[1] ?? 'A1').col,
      );
      return `<row r="${r}"${x.alto ? ` ht="${x.alto}" customHeight="1"` : ''}>${celdas.join('')}</row>`;
    })
    .join('');
  const hoja = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:J${Math.max(...filas.keys())}"/><sheetViews><sheetView showGridLines="0" tabSelected="1" workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${datos}</sheetData><mergeCells count="${combinadas.length}">${combinadas.map((r) => `<mergeCell ref="${r}"/>`).join('')}</mergeCells><pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="1" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;

  const a: ArchivosZip = new Map();
  a.set(
    '[Content_Types].xml',
    bytes(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ),
  );
  a.set(
    '_rels/.rels',
    bytes(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
  );
  a.set(
    'xl/workbook.xml',
    bytes(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="Solicitud de corrida" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
    ),
  );
  a.set(
    'xl/_rels/workbook.xml.rels',
    bytes(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
  );
  a.set('xl/styles.xml', bytes(ESTILOS_CELMI));
  a.set('xl/worksheets/sheet1.xml', bytes(hoja));
  return escribirZip(a);
}
