import { describe, expect, it } from 'vitest';
import {
  aEscalado,
  anticipoDe,
  calcularCorrida,
  calcularPartida,
  calcularTotales,
  consolidarLinea,
  dividirRedondeando,
  enteroALetras,
  formatearFolio,
  formatearMXN,
  importeConLetra,
  mejoraDePrecio,
  precioUnitario,
  sumarPorcentajes,
} from './index';

describe('aritmética decimal', () => {
  it('convierte texto decimal a enteros escalados sin perder precisión', () => {
    expect(aEscalado('14533.46', 2)).toBe(1453346n);
    expect(aEscalado('600', 2)).toBe(60000n);
    expect(aEscalado('13.5', 4)).toBe(135000n);
  });

  it('rechaza valores inválidos o con más decimales de los permitidos', () => {
    expect(() => aEscalado('12,5', 2)).toThrow();
    expect(() => aEscalado('1.234', 2)).toThrow();
    expect(() => aEscalado('', 2)).toThrow();
  });

  it('redondea a la mitad hacia arriba', () => {
    expect(dividirRedondeando(5n, 10n)).toBe(1n);
    expect(dividirRedondeando(4n, 10n)).toBe(0n);
    expect(dividirRedondeando(15n, 10n)).toBe(2n);
    expect(dividirRedondeando(-5n, 10n)).toBe(-1n);
  });

  it('da formato de moneda mexicano', () => {
    expect(formatearMXN(3826951n)).toBe('$38,269.51');
    expect(formatearMXN(5n)).toBe('$0.05');
    expect(formatearMXN(123456789012n)).toBe('$1,234,567,890.12');
  });
});

describe('precios', () => {
  it('aplica tipo de cambio sin redondear el costo convertido antes de la utilidad', () => {
    // 6842.00 USD × 18.42 = 126,029.64 MXN; × 1.22 = 153,756.1608 → 153,756.16
    expect(precioUnitario({ costoUnitario: '6842.00', tipoCambio: '18.42', utilidadPct: '22' })).toBe(
      15375616n,
    );
    // Tipo de cambio con 5 decimales (decisión 2026-10-05): 100 × 18.12345 × 1.10 = 1993.5795 → 1993.58
    expect(precioUnitario({ costoUnitario: '100', tipoCambio: '18.12345', utilidadPct: '10' })).toBe(199358n);
    // Con más de 5 decimales se rechaza.
    expect(() =>
      precioUnitario({ costoUnitario: '100', tipoCambio: '18.123456', utilidadPct: '10' }),
    ).toThrow();
  });

  it('calcula la utilidad unitaria y total de una partida', () => {
    const p = calcularPartida({ costoUnitario: '14533.46', cantidad: 2, utilidadPct: '13.5' });
    expect(p.precioUnitario).toBe(1649548n);
    expect(p.utilidadUnitaria).toBe(196202n);
    expect(p.costoTotal).toBe(2906692n);
    expect(p.utilidadTotal).toBe(392404n);
  });

  it('rechaza entradas no definidas por el negocio', () => {
    expect(() => calcularPartida({ costoUnitario: '10', cantidad: 0, utilidadPct: '10' })).toThrow();
    expect(() => calcularPartida({ costoUnitario: '10', cantidad: 1.5, utilidadPct: '10' })).toThrow();
    expect(() => precioUnitario({ costoUnitario: '10', utilidadPct: '-5' })).toThrow();
    expect(() => precioUnitario({ costoUnitario: '10', tipoCambio: '0', utilidadPct: '5' })).toThrow();
  });

  it('no consolida partidas con cantidades distintas', () => {
    const a = calcularPartida({ costoUnitario: '10', cantidad: 2, utilidadPct: '10' });
    const b = calcularPartida({ costoUnitario: '10', cantidad: 3, utilidadPct: '10' });
    expect(() => consolidarLinea([a, b])).toThrow();
    expect(() => consolidarLinea([])).toThrow();
  });

  it('calcula IVA del 16 % sobre el subtotal', () => {
    expect(calcularTotales([{ importe: 3299096n }])).toEqual({
      subtotal: 3299096n,
      iva: 527855n,
      total: 3826951n,
    });
    expect(calcularTotales([])).toEqual({ subtotal: 0n, iva: 0n, total: 0n });
  });
});

describe('mejora de precio', () => {
  it('calcula ahorro y porcentaje contra el precio anterior (casos EPOXEMEX)', () => {
    expect(mejoraDePrecio('19306.67', '14533.46')).toEqual({ ahorro: 477321n, porcentaje: '24.7' });
    expect(mejoraDePrecio('25920.00', '23145.54')).toEqual({ ahorro: 277446n, porcentaje: '10.7' });
    expect(mejoraDePrecio('16426.67', '16224.21')).toEqual({ ahorro: 20246n, porcentaje: '1.2' });
    expect(mejoraDePrecio('26133.33', '23975.56')).toEqual({ ahorro: 215777n, porcentaje: '8.3' });
  });

  it('reporta aumentos como porcentaje negativo y rechaza un precio anterior de cero', () => {
    expect(mejoraDePrecio('100', '110')).toEqual({ ahorro: -1000n, porcentaje: '-10.0' });
    expect(() => mejoraDePrecio('0', '10')).toThrow();
  });
});

describe('importe con letra', () => {
  it.each([
    [0n, 'CERO PESOS 00/100 M.N.'],
    [100n, 'UN PESO 00/100 M.N.'],
    [2100n, 'VEINTIÚN PESOS 00/100 M.N.'],
    [3150n, 'TREINTA Y UN PESOS 50/100 M.N.'],
    [10000n, 'CIEN PESOS 00/100 M.N.'],
    [10100n, 'CIENTO UN PESOS 00/100 M.N.'],
    [100000n, 'MIL PESOS 00/100 M.N.'],
    [2100000n, 'VEINTIÚN MIL PESOS 00/100 M.N.'],
    [50050007n, 'QUINIENTOS MIL QUINIENTOS PESOS 07/100 M.N.'],
    [100000000n, 'UN MILLÓN DE PESOS 00/100 M.N.'],
    [100100000n, 'UN MILLÓN MIL PESOS 00/100 M.N.'],
    [250000050n, 'DOS MILLONES QUINIENTOS MIL PESOS 50/100 M.N.'],
    [2100000000n, 'VEINTIÚN MILLONES DE PESOS 00/100 M.N.'],
  ])('%s centavos → %s', (c, letra) => {
    expect(importeConLetra(c)).toBe(letra);
  });

  it('usa la forma completa fuera del importe', () => {
    expect(enteroALetras(21)).toBe('VEINTIUNO');
    expect(enteroALetras(999999)).toBe('NOVECIENTOS NOVENTA Y NUEVE MIL NOVECIENTOS NOVENTA Y NUEVE');
  });
});

describe('folio', () => {
  it('sigue la estructura CELMISOLUTIONS-AAAA + 6 dígitos', () => {
    expect(formatearFolio(2026, 1253)).toBe('CELMISOLUTIONS-2026001253');
    expect(formatearFolio(2027, 1)).toBe('CELMISOLUTIONS-2027000001');
  });

  it('rechaza consecutivos fuera de rango', () => {
    expect(() => formatearFolio(2026, 0)).toThrow();
    expect(() => formatearFolio(2026, 1_000_000)).toThrow();
  });
});

describe('transaccionalidad y anticipo (2026-10-07)', () => {
  it('suma porcentajes sin perder decimales', () => {
    expect(sumarPorcentajes('13.5', '3')).toBe('16.5');
    expect(sumarPorcentajes('10', '0')).toBe('10');
    expect(sumarPorcentajes('0.0001', '2.9999')).toBe('3');
  });
  it('anticipo y monto para liquidar suman el total', () => {
    expect(anticipoDe(11600000n, '50')).toEqual({ anticipo: 5800000n, liquidar: 5800000n });
    const r = anticipoDe(999999n, '33.3333');
    expect(r.anticipo + r.liquidar).toBe(999999n);
    expect(anticipoDe(100n, '100')).toEqual({ anticipo: 100n, liquidar: 0n });
    expect(() => anticipoDe(100n, '101')).toThrow();
  });
  it('la corrida suma la transaccionalidad a la utilidad', () => {
    const c = calcularCorrida([
      {
        id: 'p',
        esAdicional: false,
        partidas: [
          {
            id: 'a',
            padreId: null,
            presentacion: 'linea',
            cantidad: 1,
            seSuma: false,
            prorratearEntre: [],
            costoUnitario: '14533.46',
            tipoCambio: '1',
            utilidadPct: '13.5',
            transaccionPct: '3',
          },
        ],
      },
    ]);
    expect(c.partidas.get('a')?.precioUnitario).toBe(1693148n);
  });
});
