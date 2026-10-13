import { describe, expect, it } from 'vitest';
import { aBase64Url, cifrarMensaje, deBase64Url, encabezadoVapid, generarClaves } from './cifrado';

// Vector de prueba del RFC 8291, apéndice A.
const RFC = {
  mensaje: 'When I grow up, I want to be a watermelon',
  servidor: {
    privada: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
    publica: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  },
  ua: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  sal: 'DGv6ra1nlYgDCS1FRnbzlw',
  esperado:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

describe('Web Push', () => {
  it('cifra igual que el vector del RFC 8291', async () => {
    const r = await cifrarMensaje({ p256dh: RFC.ua, auth: RFC.auth }, new TextEncoder().encode(RFC.mensaje), {
      servidor: RFC.servidor,
      sal: RFC.sal,
    });
    expect(aBase64Url(r)).toBe(RFC.esperado);
  });

  it('base64url ida y vuelta', () => {
    const b = new Uint8Array([0, 250, 251, 252, 253, 254, 255, 62, 63]);
    expect([...deBase64Url(aBase64Url(b))]).toEqual([...b]);
  });

  it('firma VAPID verificable con la llave pública', async () => {
    const vapid = await generarClaves();
    const h = await encabezadoVapid(
      'https://fcm.googleapis.com/fcm/send/xyz',
      vapid,
      'https://celmi.example',
      0,
    );
    const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(h) ?? [];
    expect(k).toBe(vapid.publica);
    const [cab, cuerpo, firma] = jwt!.split('.');
    expect(JSON.parse(new TextDecoder().decode(deBase64Url(cuerpo!)))).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: 12 * 3600,
      sub: 'https://celmi.example',
    });
    const pub = await crypto.subtle.importKey(
      'raw',
      deBase64Url(vapid.publica),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pub,
      deBase64Url(firma!),
      new TextEncoder().encode(`${cab}.${cuerpo}`),
    );
    expect(ok).toBe(true);
  });
});
