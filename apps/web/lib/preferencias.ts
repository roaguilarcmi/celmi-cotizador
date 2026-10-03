'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Preferencias visuales de quien usa el navegador (menú compacto, columnas visibles…).
 * Viven en localStorage: son comodidades personales, no datos del negocio.
 * Fase 1: se moverán al perfil del usuario para que lo sigan en cualquier equipo.
 */
const EVENTO = 'celmi-preferencias';

function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

export function guardarPreferencia(clave: string, valor: string | null) {
  try {
    if (valor === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, valor);
  } catch {
    // Sin almacenamiento (modo privado): la preferencia dura sólo esta visita.
  }
  window.dispatchEvent(new Event(EVENTO));
}

function suscribir(cambio: () => void) {
  window.addEventListener('storage', cambio);
  window.addEventListener(EVENTO, cambio);
  return () => {
    window.removeEventListener('storage', cambio);
    window.removeEventListener(EVENTO, cambio);
  };
}

/** Lee y escribe una preferencia; en el servidor siempre vale null. */
export function usePreferencia(clave: string): [string | null, (valor: string | null) => void] {
  const valor = useSyncExternalStore(
    suscribir,
    () => leer(clave),
    () => null,
  );
  const guardar = useCallback((v: string | null) => guardarPreferencia(clave, v), [clave]);
  return [valor, guardar];
}
