import { describe, expect, it } from 'vitest';
import { mismoOrigen } from './peticiones';

const pet = (h: Record<string, string>) =>
  new Request('http://localhost:3000/cotizaciones/x/solicitud-corrida', { method: 'POST', headers: h });

describe('mismoOrigen', () => {
  it('acepta el propio cotizador aunque Next.js diga «localhost»', () => {
    expect(mismoOrigen(pet({ origin: 'http://127.0.0.1:3000', host: '127.0.0.1:3000' }))).toBe(true);
    expect(
      mismoOrigen(
        pet({
          origin: 'https://celmi-solutions.netlify.app',
          host: 'interno',
          'x-forwarded-host': 'celmi-solutions.netlify.app',
        }),
      ),
    ).toBe(true);
  });

  it('rechaza otros sitios o peticiones sin origen', () => {
    expect(mismoOrigen(pet({ origin: 'https://otro.example', host: '127.0.0.1:3000' }))).toBe(false);
    expect(mismoOrigen(pet({ origin: 'http://127.0.0.1:4000', host: '127.0.0.1:3000' }))).toBe(false);
    expect(mismoOrigen(pet({ host: '127.0.0.1:3000' }))).toBe(false);
    expect(mismoOrigen(pet({ origin: 'null', host: '127.0.0.1:3000' }))).toBe(false);
  });
});
