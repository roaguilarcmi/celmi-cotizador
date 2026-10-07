import { describe, expect, it } from 'vitest';
import { numeroDePagos, tasaAnualNominal, valorResidual } from './financiamiento';

describe('numeroDePagos', () => {
  it('divide el plazo entre los meses de cada pago', () => {
    expect(numeroDePagos(36, 'mensual')).toBe(36);
    expect(numeroDePagos(36, 'trimestral')).toBe(12);
    expect(numeroDePagos(36, 'anual')).toBe(3);
  });
  it('rechaza plazos que no se dividen exacto', () => {
    expect(() => numeroDePagos(36, 'semestral')).not.toThrow();
    expect(() => numeroDePagos(32, 'trimestral')).toThrow(/no se divide/);
  });
});

describe('valorResidual', () => {
  it('de porcentaje a monto y de monto a porcentaje', () => {
    expect(valorResidual(10000000n, { porcentaje: '10' })).toEqual({ porcentaje: '10', monto: 1000000n });
    expect(valorResidual(10000000n, { monto: 1234567n })).toEqual({ porcentaje: '12.3457', monto: 1234567n });
    expect(valorResidual(33333333n, { porcentaje: '15.5' }).monto).toBe(5166667n);
  });
  it('no admite residual mayor que el valor ni porcentajes fuera de 0–100', () => {
    expect(() => valorResidual(100000n, { monto: 100001n })).toThrow();
    expect(() => valorResidual(100000n, { porcentaje: '101' })).toThrow();
  });
});

describe('tasaAnualNominal (pagos vencidos)', () => {
  it('reproduce una anualidad conocida', () => {
    // 100,000 en 12 pagos mensuales de 9,000 → 1.2043 % mensual ≈ 14.45 % anual nominal.
    const t = Number(
      tasaAnualNominal({ valor: 10000000n, pagoPorPeriodo: 900000n, pagos: 12, frecuencia: 'mensual' }),
    );
    expect(t).toBeGreaterThan(14.4);
    expect(t).toBeLessThan(14.5);
  });
  it('con pago exacto a tasa conocida (2 % mensual, 24 pagos) da 24 % anual', () => {
    // Pago = 100,000 × 0.02 / (1 − 1.02^−24) = 5,287.11
    const t = tasaAnualNominal({
      valor: 10000000n,
      pagoPorPeriodo: 528711n,
      pagos: 24,
      frecuencia: 'mensual',
    });
    expect(Number(t)).toBeCloseTo(24, 2);
  });
  it('anualiza según la frecuencia y devuelve null sin pagos', () => {
    const t = tasaAnualNominal({
      valor: 10000000n,
      pagoPorPeriodo: 2700000n,
      pagos: 4,
      frecuencia: 'trimestral',
    });
    expect(Number(t)).toBeGreaterThan(0);
    expect(
      tasaAnualNominal({ valor: 10000000n, pagoPorPeriodo: 0n, pagos: 12, frecuencia: 'mensual' }),
    ).toBeNull();
  });
});
