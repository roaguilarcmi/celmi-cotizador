'use client';

import { useEffect } from 'react';

/** «/» enfoca el buscador de la página (salvo cuando ya se está escribiendo en un campo). */
export function AtajoBuscar() {
  useEffect(() => {
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      const campo = document.querySelector<HTMLInputElement>('[data-buscador]');
      if (campo) {
        e.preventDefault();
        campo.focus();
      }
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, []);
  return null;
}
