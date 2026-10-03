'use client';

import { useEffect } from 'react';
import { cerrarSesion } from '@/lib/acciones-sesion';

/** Minutos sin actividad antes de cerrar la sesión (valor técnico por defecto, ajustable). */
const MINUTOS = 30;

/** Cierra la sesión tras un periodo sin teclado, ratón ni toques en ninguna pestaña abierta. */
export function CierrePorInactividad() {
  useEffect(() => {
    const clave = 'celmi-ultima-actividad';
    const marcar = () => {
      try {
        localStorage.setItem(clave, String(Date.now()));
      } catch {
        // Sin almacenamiento: se cuenta sólo en esta pestaña.
      }
      ultima = Date.now();
    };
    let ultima = Date.now();
    marcar();
    const eventos = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    for (const e of eventos) window.addEventListener(e, marcar, { passive: true });
    const intervalo = window.setInterval(() => {
      let compartida = ultima;
      try {
        compartida = Math.max(ultima, Number(localStorage.getItem(clave) ?? 0));
      } catch {
        // idem
      }
      if (Date.now() - compartida > MINUTOS * 60_000) {
        window.clearInterval(intervalo);
        void cerrarSesion('inactividad');
      }
    }, 30_000);
    return () => {
      for (const e of eventos) window.removeEventListener(e, marcar);
      window.clearInterval(intervalo);
    };
  }, []);
  return null;
}
