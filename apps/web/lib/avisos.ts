/**
 * Avisos en tiempo real (Fase 8, 2026-10-13): categorías, títulos seguros para Windows con el sitio cerrado y
 * preferencias de cada persona (`perfiles.preferencias.avisos`, 0035). Se usa en el servidor y en el navegador.
 */

export type CategoriaAviso = 'cotizaciones' | 'autorizacion';

export const CATEGORIAS: Record<string, CategoriaAviso> = {
  revision_enviada: 'autorizacion',
  cancelacion_solicitada: 'autorizacion',
  revision_autorizada: 'cotizaciones',
  revision_rechazada: 'cotizaciones',
  revision_retirada: 'cotizaciones',
  revision_emitida: 'cotizaciones',
  colaborador_agregado: 'cotizaciones',
  cancelacion_resuelta: 'cotizaciones',
};

/**
 * Título para Windows cuando el cotizador está cerrado (decisión 2026-10-13): sin cliente, folio, montos ni
 * nombres; sólo qué tipo de aviso es.
 */
export const TITULOS_SEGUROS: Record<string, string> = {
  revision_enviada: 'Tienes una cotización por autorizar',
  revision_autorizada: 'Se autorizó una cotización',
  revision_rechazada: 'Se rechazó una cotización',
  revision_retirada: 'Se retiró una cotización para corregir',
  revision_emitida: 'Se emitió una cotización',
  colaborador_agregado: 'Te agregaron a una oportunidad',
  cancelacion_solicitada: 'Hay una solicitud de cancelación',
  cancelacion_resuelta: 'Se resolvió una solicitud de cancelación',
};
export const CUERPO_SEGURO = 'Abre el Cotizador CELMI para ver el detalle.';

export interface PreferenciasAvisos {
  /** Cotizaciones en las que participo (autorizada, rechazada, retirada, emitida, colaborador, cancelación resuelta). */
  cotizaciones: boolean;
  /** Para quien autoriza: solicitudes de autorización y de cancelación. */
  autorizacion: boolean;
  /** Tono breve al llegar un aviso (encendido por omisión, decisión 2026-10-13). */
  sonido: boolean;
  /** Notificación de Windows cuando el cotizador está abierto pero no a la vista. */
  windows: boolean;
}

export const AVISOS_POR_OMISION: PreferenciasAvisos = {
  cotizaciones: true,
  autorizacion: true,
  sonido: true,
  windows: true,
};

/** Lee `preferencias.avisos` del perfil con los valores por omisión. */
export function leerPreferenciasAvisos(preferencias: unknown): PreferenciasAvisos {
  const a =
    preferencias && typeof preferencias === 'object' && 'avisos' in preferencias
      ? (preferencias as { avisos: unknown }).avisos
      : null;
  const r = { ...AVISOS_POR_OMISION };
  if (a && typeof a === 'object')
    for (const k of Object.keys(r) as (keyof PreferenciasAvisos)[]) {
      const v = (a as Record<string, unknown>)[k];
      if (typeof v === 'boolean') r[k] = v;
    }
  return r;
}

/** ¿Esta persona quiere este aviso? (los tipos sin categoría siempre llegan). */
export function quiereAviso(tipo: string, p: PreferenciasAvisos): boolean {
  const c = CATEGORIAS[tipo];
  return c ? p[c] : true;
}

/**
 * Servicios de envío de los navegadores a los que el servidor puede mandar avisos (evita que una suscripción
 * apunte a otro sitio): Chrome/Edge (FCM), Edge en Windows (WNS), Firefox y Safari.
 */
export function endpointPermitido(endpoint: string): boolean {
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.port || u.username || u.password) return false;
  const h = u.hostname;
  return (
    h === 'fcm.googleapis.com' ||
    h === 'updates.push.services.mozilla.com' ||
    h === 'web.push.apple.com' ||
    h.endsWith('.notify.windows.com') ||
    h.endsWith('.push.apple.com')
  );
}
