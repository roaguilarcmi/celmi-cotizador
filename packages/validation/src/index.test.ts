import { describe, expect, it } from 'vitest';
import { clienteSchema, contactoSchema, costoPartidaSchema, oportunidadSchema, porcentaje } from './index';

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

  it('valida clientes, contactos y oportunidades', () => {
    expect(
      clienteSchema.parse({ razon_social: ' EPOXEMEX S.A. de C.V. ', rfc: 'epo010101ab1' }),
    ).toMatchObject({
      razon_social: 'EPOXEMEX S.A. de C.V.',
      rfc: 'EPO010101AB1',
    });
    expect(clienteSchema.parse({ razon_social: 'EPOXEMEX' }).rfc).toBeNull();
    expect(contactoSchema.safeParse({ nombre: 'Héctor Elizondo', correo: 'no-es-correo' }).success).toBe(
      false,
    );
    expect(contactoSchema.safeParse({ nombre: 'Héctor Elizondo', correo: '' }).success).toBe(true);
    expect(oportunidadSchema.safeParse({ cliente_id: 'x', nombre: 'Laptops' }).success).toBe(false);
  });

  it('acepta utilidades con decimales', () => {
    expect(porcentaje.safeParse('13.5').success).toBe(true);
    expect(porcentaje.safeParse('-2').success).toBe(false);
  });
});
