import { describe, expect, it } from 'vitest';
import { calcularCorrida, presentarPropuestas, type PartidaCorrida } from './corrida';

const partida = (id: string, extra: Partial<PartidaCorrida> = {}): PartidaCorrida => ({
  id,
  padreId: null,
  presentacion: 'linea',
  cantidad: 2,
  costoUnitario: '1000.00',
  tipoCambio: '1',
  utilidadPct: '10',
  seSuma: false,
  prorratearEntre: [],
  ...extra,
});

describe('calcularCorrida', () => {
  it('consolida los incluidos y deja los adicionales visibles como línea propia', () => {
    const c = calcularCorrida([
      {
        id: 'p1',
        esAdicional: false,
        partidas: [
          partida('laptop'),
          partida('ram', {
            padreId: 'laptop',
            presentacion: 'incluida',
            costoUnitario: '100.00',
            utilidadPct: '20',
          }),
          partida('maletin', { padreId: 'laptop', costoUnitario: '50.00', cantidad: 1 }),
        ],
      },
    ]);
    const [p] = c.propuestas;
    expect(p?.lineas.map((l) => [l.partidaId, l.precioUnitario, l.importe])).toEqual([
      ['laptop', 110000n + 12000n, 244000n],
      ['maletin', 5500n, 5500n],
    ]);
    expect(p?.lineas[0]?.incluidas).toEqual(['ram']);
    expect(p?.totales).toEqual({ subtotal: 249500n, iva: 39920n, total: 289420n });
    expect(c.costo).toBe(200000n + 20000n + 5000n);
    expect(c.utilidad).toBe(c.venta - c.costo);
  });

  it('reparte el cargo en proporción al precio de venta e informa la diferencia de redondeo', () => {
    const c = calcularCorrida([
      {
        id: 'p1',
        esAdicional: false,
        partidas: [
          partida('a', { cantidad: 3, costoUnitario: '100.00', utilidadPct: '0' }),
          partida('b', { cantidad: 1, costoUnitario: '200.00', utilidadPct: '0' }),
          partida('envio', {
            presentacion: 'prorrateada',
            cantidad: 1,
            costoUnitario: '100.00',
            utilidadPct: '0',
            prorratearEntre: ['a', 'b'],
          }),
        ],
      },
    ]);
    const [p] = c.propuestas;
    // 100 entre 300 y 200 → 60 y 40; a: 60 / 3 = 20 por pieza.
    expect(p?.lineas.map((l) => [l.partidaId, l.precioUnitario, l.cargo])).toEqual([
      ['a', 12000n, 6000n],
      ['b', 24000n, 4000n],
    ]);
    expect(p?.cargos[0]?.diferencia).toBe(0n);
    expect(p?.totales.subtotal).toBe(60000n);
  });

  it('el cargo con unitario que no divide exacto deja diferencia de centavos', () => {
    const [p] = presentarPropuestas([
      {
        id: 'p1',
        esAdicional: false,
        partidas: [
          {
            id: 'a',
            padreId: null,
            presentacion: 'linea',
            cantidad: 3,
            precioUnitario: 10000n,
            seSuma: false,
            prorratearEntre: [],
          },
          {
            id: 'c',
            padreId: null,
            presentacion: 'prorrateada',
            cantidad: 1,
            precioUnitario: 100n,
            seSuma: false,
            prorratearEntre: ['a'],
          },
        ],
      },
    ]);
    // 1.00 entre 3 piezas → 0.33 por pieza: 0.99, un centavo menos.
    expect(p?.lineas[0]?.precioUnitario).toBe(10033n);
    expect(p?.cargos[0]?.diferencia).toBe(-1n);
  });

  it('suma los adicionales marcados a cada propuesta principal', () => {
    const c = calcularCorrida([
      { id: 'p1', esAdicional: false, partidas: [partida('x', { cantidad: 1, utilidadPct: '0' })] },
      {
        id: 'p2',
        esAdicional: false,
        partidas: [partida('y', { cantidad: 1, costoUnitario: '2000.00', utilidadPct: '0' })],
      },
      {
        id: 'ad',
        esAdicional: true,
        partidas: [
          partida('ssd', { cantidad: 1, costoUnitario: '500.00', utilidadPct: '0', seSuma: true }),
          partida('mouse', { cantidad: 1, costoUnitario: '100.00', utilidadPct: '0' }),
        ],
      },
    ]);
    expect(c.propuestas.map((p) => p.totales.subtotal)).toEqual([150000n, 250000n, 60000n]);
  });

  it('rechaza utilidad negativa y cargos sin destino', () => {
    expect(() =>
      calcularCorrida([{ id: 'p', esAdicional: false, partidas: [partida('a', { utilidadPct: '-1' })] }]),
    ).toThrow();
    expect(() =>
      calcularCorrida([
        {
          id: 'p',
          esAdicional: false,
          partidas: [partida('a'), partida('c', { presentacion: 'prorrateada' })],
        },
      ]),
    ).toThrow(/prorrateado/);
  });
});
