import { describe, expect, it } from 'vitest';
import {
  empatarCatalogo,
  estructurarPegado,
  leerFecha,
  leerImporte,
  leerPegado,
  separarCeldas,
} from './pegado';

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
      partida: '1',
      propuesta: '',
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

describe('pegar adicionales y varias propuestas (2026-10-10)', () => {
  const ENCABEZADO = 'PROPUESTA\tPARTIDA\tDESCRIPCIÓN\tCANTIDAD\tCOSTO UNITARIO ANTES DE IVA';
  it('«1.1», «1.2» son adicionales de la partida 1; «2.1», de la 2', () => {
    const r = leerPegado(
      [
        'PARTIDA\tDESCRIPCIÓN\tCANTIDAD\tCOSTO',
        '1\tLaptop\t10\t14533.46',
        '1.1\tMemoria RAM\t10\t900',
        '1.2\tInstalación\t10\t150',
        '2\tMonitor\t10\t4210',
        '2.1\tBase\t10\t300',
      ].join('\n'),
    );
    const { propuestas, avisos } = estructurarPegado(r.filas, r.conPropuestas);
    expect(r.conPropuestas).toBe(false);
    expect(propuestas).toHaveLength(1);
    expect(propuestas[0]!.nombre).toBeNull();
    expect(
      propuestas[0]!.partidas.map((p) => [p.fila.descripcion, p.adicionales.map((a) => a.descripcion)]),
    ).toEqual([
      ['Laptop', ['Memoria RAM', 'Instalación']],
      ['Monitor', ['Base']],
    ]);
    expect(avisos.size).toBe(0);
  });

  it('la columna «Propuesta» reparte en varias propuestas; las celdas combinadas heredan la de arriba', () => {
    const r = leerPegado(
      [
        ENCABEZADO,
        '1\t1\tLaptop A\t10\t100',
        '\t1.1\tRAM A\t10\t10',
        '\t2\tMonitor A\t10\t50',
        '2\t1\tLaptop B\t10\t120',
        '\t1.1\tRAM B\t10\t12',
        'Opción especial\t1\tLaptop C\t5\t200',
      ].join('\n'),
    );
    const { propuestas } = estructurarPegado(r.filas, r.conPropuestas);
    expect(r.conPropuestas).toBe(true);
    expect(propuestas.map((p) => p.nombre)).toEqual(['Propuesta 1', 'Propuesta 2', 'Opción especial']);
    expect(propuestas[0]!.partidas.map((p) => p.fila.descripcion)).toEqual(['Laptop A', 'Monitor A']);
    expect(propuestas[0]!.partidas[0]!.adicionales.map((a) => a.descripcion)).toEqual(['RAM A']);
    expect(propuestas[1]!.partidas[0]!.adicionales.map((a) => a.descripcion)).toEqual(['RAM B']);
  });

  it('un adicional sin su partida queda como partida, con aviso', () => {
    const r = leerPegado(['PARTIDA\tDESCRIPCIÓN\tCANTIDAD\tCOSTO', '3.1\tSuelto\t1\t10'].join('\n'));
    const { propuestas, avisos } = estructurarPegado(r.filas, r.conPropuestas);
    expect(propuestas[0]!.partidas).toHaveLength(1);
    expect(avisos.get(1)?.[0]).toMatch(/No hay partida 3/);
  });
});
