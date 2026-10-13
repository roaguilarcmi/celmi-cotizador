import { describe, expect, it } from 'vitest';
import { endpointPermitido, leerPreferenciasAvisos, quiereAviso, TITULOS_SEGUROS } from './avisos';

describe('avisos en tiempo real', () => {
  it('preferencias: sonido y todo lo demás encendido por omisión; respeta lo guardado', () => {
    expect(leerPreferenciasAvisos(null)).toEqual({
      cotizaciones: true,
      autorizacion: true,
      sonido: true,
      windows: true,
    });
    expect(leerPreferenciasAvisos({ avisos: { sonido: false, raro: 1, windows: 'no' } })).toEqual({
      cotizaciones: true,
      autorizacion: true,
      sonido: false,
      windows: true,
    });
  });

  it('cada quien elige qué avisos recibe', () => {
    const p = { ...leerPreferenciasAvisos(null), autorizacion: false };
    expect(quiereAviso('revision_enviada', p)).toBe(false);
    expect(quiereAviso('revision_autorizada', p)).toBe(true);
  });

  it('sólo se envía a los servicios de los navegadores (no a cualquier dirección)', () => {
    expect(endpointPermitido('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(endpointPermitido('https://wns2-by3p.notify.windows.com/w/?token=x')).toBe(true);
    expect(endpointPermitido('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
    expect(endpointPermitido('https://web.push.apple.com/x')).toBe(true);
    expect(endpointPermitido('http://fcm.googleapis.com/x')).toBe(false);
    expect(endpointPermitido('https://fcm.googleapis.com.evil.example/x')).toBe(false);
    expect(endpointPermitido('https://notify.windows.com.evil.example/x')).toBe(false);
    expect(endpointPermitido('https://127.0.0.1/x')).toBe(false);
    expect(endpointPermitido('https://fcm.googleapis.com:8443/x')).toBe(false);
    expect(endpointPermitido('no es url')).toBe(false);
  });

  it('los títulos para Windows con el sitio cerrado no llevan datos de la cotización', () => {
    for (const t of Object.values(TITULOS_SEGUROS)) {
      expect(t).not.toMatch(/CELMISOLUTIONS-|\$|\d{3,}/);
    }
  });
});
