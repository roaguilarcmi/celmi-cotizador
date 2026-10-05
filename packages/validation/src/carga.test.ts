import { describe, expect, it } from 'vitest';
import * as validacion from './index';

describe('el paquete carga completo (sin importaciones circulares)', () => {
  it('expone los esquemas de cotización y los numéricos', () => {
    expect(validacion.propuestasCotizacionSchema).toBeDefined();
    expect(validacion.dinero.safeParse('14533.46').success).toBe(true);
    expect(validacion.tipoCambio.safeParse('18.123456').success).toBe(false);
  });
});
