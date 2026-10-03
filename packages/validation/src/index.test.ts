import { describe, expect, it } from 'vitest';
import { costoPartidaSchema, porcentaje } from './index';

describe('validación compartida', () => {
  it('acepta una partida válida de EPOXEMEX', () => {
    const r = costoPartidaSchema.safeParse({
      sku: '2GHTM',
      mayorista: 'Ingram Micro',
      cantidad: 2,
      moneda: 'MXN',
      costoUnitario: '14533.46',
    });
    expect(r.success).toBe(true);
  });

  it('rechaza costos con coma, más de 2 decimales o cantidades no enteras', () => {
    const base = { sku: 'X', mayorista: 'CVA', cantidad: 1, moneda: 'MXN' as const };
    expect(costoPartidaSchema.safeParse({ ...base, costoUnitario: '14,533.46' }).success).toBe(false);
    expect(costoPartidaSchema.safeParse({ ...base, costoUnitario: '1.234' }).success).toBe(false);
    expect(costoPartidaSchema.safeParse({ ...base, cantidad: 1.5, costoUnitario: '1' }).success).toBe(false);
  });

  it('acepta utilidades con decimales', () => {
    expect(porcentaje.safeParse('13.5').success).toBe(true);
    expect(porcentaje.safeParse('-2').success).toBe(false);
  });
});
