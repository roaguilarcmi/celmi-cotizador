'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/Icon';
import { ETAPAS, estaAbierta, type EstadoTarea } from '@/lib/etapas-tareas';

/**
 * Título de la tarea que, al hacer clic, abre «Mover a…» con las etapas del pipeline (decisión 2026-10-05), además de
 * «Abrir detalles» y «Cancelar» (una cancelada se reabre moviéndola a cualquier etapa). El menú se dibuja en una capa fija para que no lo recorten las columnas.
 */
export function MenuTarea({
  titulo,
  estado,
  onMover,
  onAbrir,
  className = '',
}: {
  titulo: string;
  estado: EstadoTarea;
  onMover: (estado: EstadoTarea) => void;
  onAbrir: () => void;
  className?: string;
}) {
  const idMenu = useId();
  const boton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; arriba: boolean } | null>(null);
  const abierto = pos !== null;

  const abrir = () => {
    const r = boton.current?.getBoundingClientRect();
    if (!r) return;
    const arriba = r.bottom + 300 > window.innerHeight && r.top > 300;
    setPos({ x: Math.min(r.left, window.innerWidth - 248), y: arriba ? r.top - 6 : r.bottom + 6, arriba });
  };
  const cerrar = (devolverFoco = true) => {
    setPos(null);
    if (devolverFoco) boton.current?.focus();
  };

  useEffect(() => {
    if (!abierto) return;
    menu.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus();
    const fuera = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !boton.current?.contains(e.target as Node))
        cerrar(false);
    };
    const mover = () => cerrar(false);
    document.addEventListener('mousedown', fuera);
    window.addEventListener('resize', mover);
    window.addEventListener('scroll', mover, true);
    return () => {
      document.removeEventListener('mousedown', fuera);
      window.removeEventListener('resize', mover);
      window.removeEventListener('scroll', mover, true);
    };
  }, [abierto]);

  const teclas = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // no cierra la ventana flotante que lo contenga
      cerrar();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = items.length;
      items[(i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n]?.focus();
    } else if (e.key === 'Tab') cerrar(false);
  };

  const elegir = (accion: () => void) => {
    cerrar();
    accion();
  };

  const opcion =
    'flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-sm px-3 text-left text-[13px] font-semibold outline-none hover:bg-superficie-2 focus-visible:bg-superficie-2';

  return (
    <>
      <button
        ref={boton}
        type="button"
        onClick={() => (abierto ? cerrar() : abrir())}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? idMenu : undefined}
        title="Mover a otra etapa"
        className={`group/titulo inline-flex max-w-full cursor-pointer items-start gap-1 rounded-sm text-left hover:text-acento-texto focus-visible:outline-2 focus-visible:outline-acento ${className}`}
      >
        <span className="min-w-0">{titulo}</span>
        <Icon
          name="derecha"
          size={13}
          className="mt-[3px] shrink-0 rotate-90 opacity-40 transition-opacity group-hover/titulo:opacity-100"
        />
      </button>
      {pos &&
        createPortal(
          <div
            ref={menu}
            id={idMenu}
            role="menu"
            aria-label={`Acciones de «${titulo}»`}
            onKeyDown={teclas}
            style={{ left: pos.x, top: pos.y, transform: pos.arriba ? 'translateY(-100%)' : undefined }}
            className="animar-entrada fixed z-[60] w-60 rounded-md border border-borde bg-superficie p-1.5 text-texto shadow-xl"
          >
            <button type="button" role="menuitem" onClick={() => elegir(onAbrir)} className={opcion}>
              <Icon name="ojo" size={15} className="text-texto-suave" />
              Abrir detalles
            </button>
            <div className="mx-3 mt-2 mb-1 text-[11px] font-bold tracking-wide text-texto-suave uppercase">
              Mover a
            </div>
            {ETAPAS.filter((e) => e.id !== estado).map((e) => (
              <button
                key={e.id}
                type="button"
                role="menuitem"
                onClick={() => elegir(() => onMover(e.id))}
                className={opcion}
              >
                <span aria-hidden="true" className={`size-2.5 rounded-full ${e.punto}`} />
                {e.nombre}
              </button>
            ))}
            {estaAbierta(estado) && (
              <>
                <div className="my-1.5 border-t border-borde" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => elegir(() => onMover('cancelada'))}
                  className={`${opcion} text-peligro`}
                >
                  <Icon name="cerrar" size={15} />
                  Cancelar tarea
                </button>
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
