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
