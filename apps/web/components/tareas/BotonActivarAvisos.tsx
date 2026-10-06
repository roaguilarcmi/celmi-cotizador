'use client';

import { useSyncExternalStore } from 'react';
import { Boton } from '@/components/ui';

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
    <Boton
      variante={compacto ? 'fantasma' : 'secundario'}
      tamano="chico"
      icono="campana"
      onClick={async () => {
        await Notification.requestPermission();
        window.dispatchEvent(new Event(EVENTO));
      }}
    >
      Activar notificaciones del navegador
    </Boton>
  );
}
