import { describe, expect, it } from 'vitest';
import { compararPartidas, variacion, type PartidaComparable } from './comparacion';

const p = (id: string, extra: Partial<PartidaComparable> = {}): PartidaComparable => ({
  id,
  origenId: null,
  propuestaId: 'p',
  sku: 'SKU',
  descripcion: 'Laptop',
  cantidad: 2,
  moneda: 'MXN',
  costoUnitario: '100.00',
  precioUnitario: '115.00',
  ...extra,
});

describe('variacion', () => {
  it('calcula el % con un decimal, con signo', () => {
    expect(variacion('15800.00', '14533.46')).toBe('-8.0');
    expect(variacion('100.00', '110.00')).toBe('10.0');
    expect(variacion('0', '10.00')).toBeNull();
  });
});

describe('compararPartidas', () => {
  it('empata por origen y detecta cambios, nuevas y eliminadas', () => {
    const antes = [p('a1'), p('a2', { sku: 'MON' }), p('a3', { sku: 'MOUSE' })];
    const despues = [
      p('b1', { origenId: 'a1' }),
      p('b2', { origenId: 'a2', sku: 'MON', cantidad: 3, costoUnitario: '90.00', precioUnitario: null }),
      p('b4', { sku: 'NUEVA' }),
    ];
    const filas = compararPartidas(antes, despues, () => null);
    expect(filas.map((f) => [f.despues?.id ?? null, f.antes?.id ?? null, f.tipo])).toEqual([
      ['b1', 'a1', 'igual'],
      ['b2', 'a2', 'modificada'],
      ['b4', null, 'nueva'],
      [null, 'a3', 'eliminada'],
    ]);
    expect(filas[1]?.campos).toEqual(['cantidad', 'costo', 'precio']);
    expect(filas[1]?.variacionCosto).toBe('-10.0');
    expect(filas[1]?.variacionPrecio).toBeNull();
  });

  it('sigue la cadena de orígenes entre varias Rev', () => {
    const origenes: Record<string, string | null> = { b1: 'a1' };
    const filas = compararPartidas(
      [p('a1')],
      [p('c1', { origenId: 'b1', costoUnitario: '95.00' })],
      (id) => origenes[id] ?? null,
    );
    expect(filas[0]?.antes?.id).toBe('a1');
    expect(filas[0]?.variacionCosto).toBe('-5.0');
  });

  it('no compara costos en monedas distintas y sólo compara utilidad si se conoce', () => {
    const [f] = compararPartidas(
      [p('a1', { utilidadPct: '15' })],
      [p('b1', { origenId: 'a1', moneda: 'USD', costoUnitario: '6.00', utilidadPct: '12' })],
      () => null,
    );
    expect(f?.campos).toEqual(['moneda', 'costo', 'utilidad']);
    expect(f?.variacionCosto).toBeNull();
  });
});
