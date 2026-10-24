import { describe, expect, it } from 'vitest';
import { excelCelmi, excelCt, excelIngram, type DatosExcel } from './formatos';
import { escribirZip, leerZip, texto } from './zip';

const DATOS: DatosExcel = {
  empresa: 'Lyon Digital S.A. de C.V.',
  rfc: 'LDI180512AB3',
  estadoEntrega: 'Ciudad de México',
  proyecto: 'Renovación de laptops 2027',
  propuesta: 'Propuesta 1',
  cotizacion: 'Sin folio',
  mayorista: 'Grupo Loma',
  plazos: [48, 36],
  esquemas: ['vjm', 'fpo'],
  lineas: Array.from({ length: 20 }, (_, i) => ({
    parte: `PM34-${i}`,
    marca: 'ASUS',
    descripcion: `Laptop ASUS <ExpertBook> & "Pro" ${i}\nRyzen 7`,
    categoria: 'Laptop',
    cantidad: i + 1,
    costoUnitario: '19500.00',
    precioUnitario: '25507.95',
  })),
  ejecutivo: {
    nombre: 'Jorge Hernández',
    puesto: 'Ejecutivo de cuenta',
    correo: 'j@celmi.com.mx',
    telefono: '771 123 4567',
  },
  fecha: new Date('2026-10-23T18:00:00Z'),
};

const xmlDe = (zip: Uint8Array, ruta: string) => texto(leerZip(zip).get(ruta));

describe('zip', () => {
  it('ida y vuelta', () => {
    const a = new Map([['a/b.xml', new TextEncoder().encode('<x>ñ</x>'.repeat(100))]]);
    expect(texto(leerZip(escribirZip(a)).get('a/b.xml'))).toBe('<x>ñ</x>'.repeat(100));
  });
});

describe('formato de CT', () => {
  const zip = excelCt(DATOS);

  it('una hoja por plazo, en orden, como libro normal (no plantilla) y sin cadena de cálculo', () => {
    const libro = xmlDe(zip, 'xl/workbook.xml');
    expect([...libro.matchAll(/<sheet [^>]*name="([^"]+)"/g)].map((m) => m[1])).toEqual([
      '36 meses',
      '48 meses',
    ]);
    expect(libro).toContain('fullCalcOnLoad="1"');
    const tipos = xmlDe(zip, '[Content_Types].xml');
    expect(tipos).toContain('spreadsheetml.sheet.main+xml');
    expect(tipos).not.toContain('template.main');
    expect(tipos).toContain('/xl/worksheets/sheet2.xml');
    expect(leerZip(zip).has('xl/calcChain.xml')).toBe(false);
    expect(leerZip(zip).has('xl/drawings/drawing2.xml')).toBe(true);
  });

  it('llena cliente, esquemas, plazo, moneda y partidas con sus fórmulas', () => {
    const h1 = xmlDe(zip, 'xl/worksheets/sheet1.xml');
    const h2 = xmlDe(zip, 'xl/worksheets/sheet2.xml');
    expect(h1).toContain('LYON DIGITAL S.A. DE C.V.');
    expect(h1).toContain('ARRENDAMIENTO VALOR DE MERCADO');
    expect(h1).toContain('FULL PAY OUT');
    expect(h1).toMatch(/<c r="D13"[^>]*><v>36<\/v>/);
    expect(h2).toMatch(/<c r="D13"[^>]*><v>48<\/v>/);
    // Las celdas combinadas siguen después de la protección de la hoja (orden que exige Excel).
    expect(h1.indexOf('<mergeCells')).toBeGreaterThan(h1.indexOf('<sheetProtection'));
    expect(h1.indexOf('<mergeCells')).toBeLessThan(h1.indexOf('<dataValidations'));
    expect(h1).toContain('<c r="G17"');
    expect(h1).toContain('<f>F17*C17</f>');
    expect(h1).toContain('<f>SUM(G17:G36)</f>');
    expect(h1).toContain('<f>G37*0.16</f>');
    // Caracteres especiales escapados.
    expect(h1).toContain('&lt;ExpertBook&gt; &amp; &quot;Pro&quot;');
    // Las listas ocultas de la plantilla (columnas H a K) siguen ahí.
    expect(h1).toContain('MONEDA NACIONAL');
    expect(h1).toContain('<dataValidation');
  });
});

describe('formato de Ingram', () => {
  const h = xmlDe(excelIngram(DATOS), 'xl/worksheets/sheet1.xml');

  it('encabezado, partidas, totales y comisión con las celdas combinadas en su lugar', () => {
    expect(h).toContain('CELMILENIUM S.A. DE C.V. (CELMI Solutions)');
    expect(h).toContain('36 y 48 meses');
    expect(h).toContain('FMV y FPO');
    expect(h).toContain('<f>G29*E29</f>');
    expect(h).toContain('<f>SUM(H10:H29)</f>');
    expect(h).toContain('<f>J30-H30</f>');
    expect(h).toContain('<mergeCell ref="B30:G30"/>');
    expect(h).toContain('<mergeCell ref="G31:H31"/>');
    expect(h).not.toContain('<mergeCell ref="B26:G26"/>');
    expect(h).toContain('<mergeCell ref="B7:J7"/>');
  });
});

describe('formato de CELMI', () => {
  const zip = excelCelmi({ ...DATOS, esquemas: ['credito'] });
  it('libro completo con datos, partidas, totales y lo que se pide', () => {
    const h = xmlDe(zip, 'xl/worksheets/sheet1.xml');
    expect(h).toContain('Solicitud de corrida financiera de crédito simple');
    expect(h).toContain('<f>SUM(H12:H31)</f>');
    expect(h).toContain('<f>ROUND(J32*0.16,2)</f>');
    expect(h).not.toContain('Opción de compra');
    expect(h).toContain('Jorge Hernández');
    expect(xmlDe(zip, 'xl/styles.xml')).toContain('<cellXfs count="14">');
  });
});
