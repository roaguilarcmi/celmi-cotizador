/*
 * Avisos de Windows con el Cotizador CELMI cerrado (Fase 8, 2026-10-13). Sólo recibe avisos (Web Push) y abre el
 * cotizador al hacer clic: no guarda páginas ni datos y no intercepta peticiones.
 * El mensaje trae únicamente un título genérico (sin clientes, folios ni montos) y un enlace interno.
 */

const TITULO = 'Tienes un aviso nuevo';
const CUERPO = 'Abre el Cotizador CELMI para ver el detalle.';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const textoSeguro = (v, porOmision, largo) =>
  typeof v === 'string' && v.trim() ? v.slice(0, largo) : porOmision;
const enlaceSeguro = (v) => (typeof v === 'string' && /^\/(?!\/)[^\s\\]*$/.test(v) ? v : '/');

self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = {};
  }
  e.waitUntil(
    (async () => {
      // Con el cotizador a la vista, el aviso ya aparece dentro de la página.
      const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (ventanas.some((v) => v.visibilityState === 'visible')) return;
      await self.registration.showNotification(textoSeguro(d.titulo, TITULO, 120), {
        body: textoSeguro(d.cuerpo, CUERPO, 200),
        tag: textoSeguro(d.etiqueta, 'aviso', 80),
        silent: d.sonido === false,
        data: { enlace: enlaceSeguro(d.enlace) },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const destino = new URL(
    enlaceSeguro(e.notification.data && e.notification.data.enlace),
    self.location.origin,
  ).href;
  e.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const v of ventanas) {
        if (new URL(v.url).origin === self.location.origin && 'focus' in v) {
          await v.navigate(destino).catch(() => undefined);
          return v.focus();
        }
      }
      return self.clients.openWindow(destino);
    })(),
  );
});
