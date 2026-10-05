import type { MouseEvent } from 'react';

/**
 * Dónde dibujar un menú flotante: dentro de la ventana modal abierta que lo contiene (si no, quedaría detrás de ella,
 * en una capa inerte) o en el `body`.
 */
export const capaDe = (origen: HTMLElement): HTMLElement => origen.closest('dialog') ?? document.body;

const INTERACTIVOS = 'button, a, input, select, textarea, label, [role="menu"], [contenteditable="true"]';

/**
 * Clic en una zona libre de la tarjeta o fila (no en sus botones, enlaces o campos): abre el detalle, como en Asana o
 * Trello. Se ignoran los clics que llegan desde un portal (la ventana de detalle, menús), que React propaga por el
 * árbol de componentes aunque no estén dentro de la tarjeta, y los que terminan una selección de texto.
 */
export const alClicLibre = (accion: () => void) => (e: MouseEvent<HTMLElement>) => {
  const destino = e.target as HTMLElement;
  if (!e.currentTarget.contains(destino)) return;
  if (destino.closest(INTERACTIVOS)) return;
  if (window.getSelection()?.toString()) return;
  accion();
};
