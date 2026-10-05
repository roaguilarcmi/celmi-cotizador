'use client';

import { useSyncExternalStore } from 'react';
import { Icon } from '@/components/Icon';

type Permiso = NotificationPermission | 'no-soportado';

const EVENTO = 'celmi-permiso-avisos';
function leer(): Permiso {
  return typeof Notification === 'undefined' ? 'no-soportado' : Notification.permission;
}
function suscribir(cambio: () => void) {
  window.addEventListener(EVENTO, cambio);
  window.addEventListener('focus', cambio);
  return () => {
    window.removeEventListener(EVENTO, cambio);
    window.removeEventListener('focus', cambio);
  };
}

export function usePermisoAvisos(): Permiso {
  return useSyncExternalStore(suscribir, leer, () => 'default' as Permiso);
}

/** Pide permiso para mostrar notificaciones del sistema (el navegador sólo lo permite tras un clic). */
export function BotonActivarAvisos({ compacto }: { compacto?: boolean }) {
  const permiso = usePermisoAvisos();
  if (permiso === 'granted' || permiso === 'no-soportado') return null;
  if (permiso === 'denied') {
    return compacto ? null : (
      <p className="text-xs text-texto-suave">
        Las notificaciones del navegador están bloqueadas para este sitio; los avisos se mostrarán sólo dentro
        de la aplicación. Puedes permitirlas desde el candado de la barra de direcciones.
      </p>
    );
  }
  return (
    <button
      type="button"
      onClick={async () => {
        await Notification.requestPermission();
        window.dispatchEvent(new Event(EVENTO));
      }}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md font-semibold text-acento-texto hover:bg-acento-suave ${
        compacto ? 'min-h-8 px-2 text-xs' : 'min-h-10 border border-acento/40 px-3 text-[13px]'
      }`}
    >
      <Icon name="campana" size={compacto ? 14 : 16} /> Activar notificaciones del navegador
    </button>
  );
}
