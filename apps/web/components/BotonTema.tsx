'use client';

import { useSyncExternalStore } from 'react';
import { Icon } from './Icon';

type Tema = 'light' | 'dark';

function temaActual(): Tema {
  const fijado = document.documentElement.dataset.theme;
  if (fijado === 'light' || fijado === 'dark') return fijado;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function suscribir(cambio: () => void) {
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const obs = new MutationObserver(cambio);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  mq.addEventListener('change', cambio);
  return () => {
    obs.disconnect();
    mq.removeEventListener('change', cambio);
  };
}

/** Alterna claro/oscuro; la preferencia se recuerda en este navegador. */
export function BotonTema() {
  const tema = useSyncExternalStore(suscribir, temaActual, () => 'light' as Tema);
  const siguiente: Tema = tema === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={() => {
        document.documentElement.dataset.theme = siguiente;
        try {
          localStorage.setItem('celmi-tema', siguiente);
        } catch {
          // Sin almacenamiento (modo privado): el cambio dura sólo esta visita.
        }
      }}
      aria-label={siguiente === 'dark' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
      className="inline-flex size-10 cursor-pointer items-center justify-center rounded-md text-nav-texto transition-colors hover:bg-white/10 hover:text-white"
    >
      <Icon name={tema === 'dark' ? 'sol' : 'luna'} />
    </button>
  );
}

/** Script previo a la hidratación para aplicar el tema guardado sin parpadeo. */
export const SCRIPT_TEMA = `try{var t=localStorage.getItem('celmi-tema');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;
