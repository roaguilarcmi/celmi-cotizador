import { describe, expect, it } from 'vitest';
import {
  calcularPartida,
  calcularTotales,
  centavosADecimal,
  conIva,
  consolidarLinea,
  importeConLetra,
} from './index';
import { PROPUESTAS_EPOXEMEX, UTILIDAD_EPOXEMEX } from './fixtures/epoxemex';

const n = (s: string) => Number(s).toFixed(2);

describe('Cotización real EPOXEMEX (CELMISOLUTIONS-2026001253)', () => {
  for (const prop of PROPUESTAS_EPOXEMEX) {
    it(`${prop.nombre} cuadra al centavo con el PDF`, () => {
      const partidas = prop.partidas.map((p) =>
        calcularPartida({
          costoUnitario: p.costoUnitario,
          cantidad: p.cantidad,
          utilidadPct: UTILIDAD_EPOXEMEX,
        }),
      );
      const linea = consolidarLinea(partidas);
      const t = calcularTotales([linea]);

      expect(centavosADecimal(linea.precioUnitario)).toBe(n(prop.esperado.precioUnitario));
      expect(centavosADecimal(t.subtotal)).toBe(n(prop.esperado.subtotal));
      expect(centavosADecimal(t.iva)).toBe(n(prop.esperado.iva));
      expect(centavosADecimal(t.total)).toBe(n(prop.esperado.total));
      expect(importeConLetra(t.total)).toBe(prop.esperado.letra);
    });
  }

  it('la utilidad total coincide con la corrida (redondeando el precio unitario)', () => {
    const todas = PROPUESTAS_EPOXEMEX.flatMap((p) =>
      p.partidas.map((x) =>
        calcularPartida({
          costoUnitario: x.costoUnitario,
          cantidad: x.cantidad,
          utilidadPct: UTILIDAD_EPOXEMEX,
        }),
      ),
    );
    const costo = todas.reduce((s, p) => s + p.costoTotal, 0n);
    const venta = todas.reduce((s, p) => s + p.importe, 0n);
    expect(centavosADecimal(costo)).toBe('274262.14');
    expect(centavosADecimal(venta)).toBe('311287.54');
    expect(centavosADecimal(venta - costo)).toBe('37025.40');
    // «Costo compra con IVA» total de la corrida (celda M10): 318,144.08.
    expect(centavosADecimal(conIva(costo))).toBe('318144.08');
  });
});
