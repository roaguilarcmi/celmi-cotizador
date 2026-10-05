import { describe, expect, it } from 'vitest';
import { menorMonto, totalesConAdicionales } from './precios';
import { etiquetaRevision, sufijoRevision } from './revisiones';

describe('sufijo de revisión (regla 2026-10-05)', () => {
  it('la original no lleva sufijo; luego A…Z y después A1…Z1, A2…', () => {
    expect(sufijoRevision(0)).toBeNull();
    expect([1, 2, 26].map(sufijoRevision)).toEqual(['A', 'B', 'Z']);
    expect([27, 28, 52, 53, 78, 79].map(sufijoRevision)).toEqual(['A1', 'B1', 'Z1', 'A2', 'Z2', 'A3']);
  });

  it('etiqueta para mostrar', () => {
    expect(etiquetaRevision(0)).toBe('Original');
    expect(etiquetaRevision(1)).toBe('Rev A');
    expect(etiquetaRevision(27)).toBe('Rev A1');
  });

  it('rechaza números no válidos', () => {
    expect(() => sufijoRevision(-1)).toThrow();
    expect(() => sufijoRevision(1.5)).toThrow();
  });
});

describe('adicionales sumados por partida (regla 2026-10-05)', () => {
  it('entran al subtotal y el IVA se calcula sobre todo junto', () => {
    const t = totalesConAdicionales([{ importe: 100000n }], [{ importe: 2550n }]);
    expect(t).toEqual({ subtotal: 102550n, iva: 16408n, total: 118958n });
  });

  it('el menor monto compara las propuestas ya con los adicionales sumados', () => {
    const p1 = [{ importe: 100000n }];
    const p2 = [{ importe: 90000n }, { importe: 5000n }];
    expect(menorMonto([p1, p2], [{ importe: 1000n }])).toBe(111360n); // (95,000 + 1,000) × 1.16
    expect(menorMonto([])).toBeNull();
  });
});

describe('costo de una partida sin utilidad', () => {
  it('convierte con el tipo de cambio y multiplica por la cantidad', async () => {
    const { costoPartida } = await import('./precios');
    const c = costoPartida({ costoUnitario: '100.00', tipoCambio: '18.12345', cantidad: 3 });
    expect(c.costoUnitarioMXN).toBe(181235n); // 1,812.345 → 1,812.35
    expect(c.costoTotal).toBe(543704n); // 5,437.035 → 5,437.04 (sin redondear antes de multiplicar)
  });
});

describe('cargos prorrateados (regla 2026-10-05)', () => {
  it('reparte sin perder centavos, en proporción a los pesos', async () => {
    const { repartir } = await import('./precios');
    expect(repartir(300000n, [6000000n, 4000000n])).toEqual([180000n, 120000n]); // $3,000 → $1,800 y $1,200
    const partes = repartir(100n, [1n, 1n, 1n]);
    expect(partes).toEqual([34n, 33n, 33n]);
    expect(partes.reduce((s, p) => s + p, 0n)).toBe(100n);
    expect(() => repartir(100n, [0n, 0n])).toThrow();
  });

  it('suma la parte de cada línea a su precio unitario según su precio de venta', async () => {
    const { prorratear } = await import('./precios');
    // Envío de $3,000.00 entre 4 laptops ($15,000 c/u) y 30 monitores ($2,000 c/u): importes $60,000 y $60,000.
    const r = prorratear(300000n, [
      { precioUnitario: 1500000n, cantidad: 4, importe: 6000000n },
      { precioUnitario: 200000n, cantidad: 30, importe: 6000000n },
    ]);
    expect(r.lineas.map((l) => l.cargo)).toEqual([150000n, 150000n]);
    expect(r.lineas.map((l) => l.precioUnitario)).toEqual([1537500n, 205000n]); // +$375.00 y +$50.00
    expect(r.diferencia).toBe(0n);
  });

  it('informa la diferencia de centavos cuando la parte no se divide exacto entre la cantidad', async () => {
    const { prorratear } = await import('./precios');
    const r = prorratear(10000n, [{ precioUnitario: 100000n, cantidad: 3, importe: 300000n }]);
    expect(r.lineas[0]!.precioUnitario).toBe(103333n); // $100 / 3 = $33.333… → $33.33
    expect(r.diferencia).toBe(-1n);
  });
});
