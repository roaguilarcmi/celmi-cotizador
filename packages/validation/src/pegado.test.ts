import { describe, expect, it } from 'vitest';
import { empatarCatalogo, leerFecha, leerImporte, leerPegado, separarCeldas } from './pegado';

// Copiado tal cual de la «Solicitud de precios» de CELMI (2026-10-05).
const SOLICITUD = [
  'PARTIDA\tSKU\tMAYORISTA\tMARCA\tTIEMPO DE ENTREGA\tDESCRIPCIÓN DEL EQUIPO\tUNIDAD DE MEDIDA\tCANTIDAD\tMONEDA\tCOSTO UNITARIO ANTES DE IVA\tVIGENCIA DE PRECIO',
  '1\t3000203931220\tINGRAM\tDELL\t10 SEMANAS\tDell Pro Precisión 5 16 (PW516261), 16", U9 386H, 64 GB, 1 TB\tPIEZA\t4\tMXN\t$65,166.76\t09-oct',
  '2\t3000203912526\tINGRAM\tDELL\t10 SEMANAS\tDell Pro 5 16 (P516260), 16", U7 355 S3, 64 GB, 1 TB\tPIEZA\t5\tMXN\t$49,480.39\t09-oct',
  '8\t3000206885045\tINGRAM\tDELL\t10 SEMANAS\tMonitor Dell Pro P22 - P2226H\tPIEZA\t30\tMXN\t$2,329.18\t09-oct',
  '9\t3000206885132\tINGRAM\tDELL\t10 SEMANAS\tTeclado y mouse Dell Pro 5 - KM526 - Disposición de teclas Latinoamérica\tPIEZA\t30\tMXN\t$406.27\t09-oct',
].join('\r\n');
const HOY = new Date(2026, 9, 5);

describe('pegar desde Excel (Fase 3B)', () => {
  it('lee la Solicitud de precios real, con su encabezado', () => {
    const r = leerPegado(SOLICITUD, HOY);
    expect(r.conEncabezado).toBe(true);
    expect(r.errores).toEqual([]);
    expect(r.filas).toHaveLength(4);
    expect(r.filas[0]).toEqual({
      fila: 1,
      sku: '3000203931220',
      mayorista: 'INGRAM',
      marca: 'DELL',
      entrega: '10 SEMANAS',
      descripcion: 'Dell Pro Precisión 5 16 (PW516261), 16", U9 386H, 64 GB, 1 TB',
      unidad: 'PIEZA',
      cantidad: 4,
      moneda: 'MXN',
      costo: '65166.76',
      vigencia: '2026-10-09',
      tipoCambio: null,
    });
    expect(r.filas[3]!.costo).toBe('406.27');
  });

  it('sin encabezado asume el orden de la Solicitud de precios', () => {
    const sinEncabezado = SOLICITUD.split('\r\n').slice(1).join('\n');
    const r = leerPegado(sinEncabezado, HOY);
    expect(r.conEncabezado).toBe(false);
    expect(r.filas.map((f) => f.cantidad)).toEqual([4, 5, 30, 30]);
  });

  it('reconoce columnas en otro orden y reporta las que no usa', () => {
    const r = leerPegado(
      'Descripción\tCantidad\tPrecio mínimo\tCosto\nSSD Kingston 1 TB\t2\t900\t1,234.50',
      HOY,
    );
    expect(r.ignoradas).toEqual(['Precio mínimo']);
    expect(r.filas[0]).toMatchObject({ descripcion: 'SSD Kingston 1 TB', cantidad: 2, costo: '1234.50' });
  });

  it('marca lo dudoso en lugar de inventarlo', () => {
    const r = leerPegado('Descripción\tCantidad\tCosto\tVigencia\nLaptop\t1.5\t$abc\t31-feb', HOY);
    expect(r.errores.map((e) => e.campo)).toEqual(['cantidad', 'costo', 'vigencia']);
  });

  it('celdas con saltos de línea entre comillas (como las copia Excel)', () => {
    expect(separarCeldas('a\t"línea 1\nlínea 2"\tc\nd\te\tf')).toEqual([
      ['a', 'línea 1\nlínea 2', 'c'],
      ['d', 'e', 'f'],
    ]);
  });

  it('importes y fechas', () => {
    expect(leerImporte('$65,166.76')).toBe('65166.76');
    expect(leerImporte('1,23,4')).toBeNull();
    expect(leerFecha('09-oct', HOY)).toBe('2026-10-09');
    expect(leerFecha('15-ene', new Date(2026, 9, 5))).toBe('2027-01-15'); // ya pasó hace > 6 meses
    expect(leerFecha('09/10/2026')).toBe('2026-10-09');
  });

  it('empata el mayorista con el catálogo («INGRAM» → «Ingram Micro»)', () => {
    const mayoristas = [{ nombre: 'CVA' }, { nombre: 'Ingram Micro' }, { nombre: 'CT Internacional' }];
    expect(empatarCatalogo('INGRAM', mayoristas)?.nombre).toBe('Ingram Micro');
    expect(empatarCatalogo('cva', mayoristas)?.nombre).toBe('CVA');
    expect(empatarCatalogo('Amazon', mayoristas)).toBeNull();
  });
});
