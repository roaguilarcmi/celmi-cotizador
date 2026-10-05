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
