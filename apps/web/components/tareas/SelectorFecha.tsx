'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '@/components/Icon';
import { capaDe } from './clicLibre';

const dos = (n: number) => String(n).padStart(2, '0');
const aFecha = (d: Date) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const aHora = (d: Date) => `${dos(d.getHours())}:${dos(d.getMinutes())}`;
const corta = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });

/** Día `n` días después de hoy, a la hora indicada (o al final del día si no hay hora). */
function dia(n: number, hora: string | null) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const [h, m] = (hora ?? '23:59').split(':').map(Number);
  d.setHours(h ?? 23, m ?? 59, 0, 0);
  return d;
}

/**
 * La fecha de una tarea como botón que abre «Reprogramar» (decisión 2026-10-05): atajos (hoy, mañana, próximo lunes,
 * en una semana), fecha y hora a elección, o quitar la fecha. Se conserva la hora que ya tenía; si no tenía, queda
 * «sin hora».
 */
export function SelectorFecha({
  venceEn,
  sinHora,
  onCambiar,
  className,
  children,
}: {
  venceEn: string | null;
  sinHora: boolean;
  onCambiar: (venceEn: string | null, sinHora: boolean) => void;
  className: string;
  children: ReactNode;
}) {
  const idPanel = useId();
  const boton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; arriba: boolean; capa: HTMLElement } | null>(null);
  const [eligiendo, setEligiendo] = useState(false);
  const actual = venceEn ? new Date(venceEn) : null;
  const horaActual = actual && !sinHora ? aHora(actual) : null;
  const [fecha, setFecha] = useState(actual ? aFecha(actual) : aFecha(dia(1, null)));
  const [hora, setHora] = useState(horaActual ?? '10:00');
  const [conHora, setConHora] = useState(Boolean(horaActual));

  const abrir = () => {
    const r = boton.current?.getBoundingClientRect();
    if (!r) return;
    const arriba = r.bottom + 340 > window.innerHeight && r.top > 340;
    setEligiendo(false);
    setPos({
      x: Math.min(r.left, window.innerWidth - 268),
      y: arriba ? r.top - 6 : r.bottom + 6,
      arriba,
      capa: capaDe(boton.current!),
    });
  };
  const cerrar = (devolverFoco = true) => {
    setPos(null);
    if (devolverFoco) boton.current?.focus();
  };
  const elegir = (d: Date | null, conHoraElegida: boolean) => {
    cerrar();
    onCambiar(d ? d.toISOString() : null, !conHoraElegida);
  };

  useEffect(() => {
    if (!pos) return;
    panel.current?.querySelector<HTMLElement>('[role=menuitem], input')?.focus();
    const fuera = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node) && !boton.current?.contains(e.target as Node))
        cerrar(false);
    };
    const mover = (e: Event) => {
      if (!panel.current?.contains(e.target as Node)) cerrar(false);
    };
    document.addEventListener('mousedown', fuera);
    window.addEventListener('resize', mover);
    window.addEventListener('scroll', mover, true);
    return () => {
      document.removeEventListener('mousedown', fuera);
      window.removeEventListener('resize', mover);
      window.removeEventListener('scroll', mover, true);
    };
  }, [pos, eligiendo]);

  const teclas = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // no cierra la ventana flotante que lo contenga
      cerrar();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...(panel.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
  };

  const lunes = (8 - new Date().getDay()) % 7 || 7;
  const todos: { nombre: string; icono: IconName; n: number }[] = [
    { nombre: 'Hoy', icono: 'sol', n: 0 },
    { nombre: 'Mañana', icono: 'reloj', n: 1 },
    { nombre: 'Próximo lunes', icono: 'derecha', n: lunes },
    { nombre: 'En una semana', icono: 'mas', n: 7 },
  ];
  // Un lunes, «próximo lunes» y «en una semana» son el mismo día: se muestra una sola vez.
  const atajos = todos.filter((a, i) => todos.findIndex((b) => b.n === a.n) === i);
  const opcion =
    'flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-sm px-3 text-left text-[13px] font-semibold outline-none hover:bg-superficie-2 focus-visible:bg-superficie-2';
  const control =
    'h-10 rounded-md border-2 border-texto/20 bg-superficie px-2.5 text-sm text-texto outline-none focus:border-acento focus:ring-4 focus:ring-acento-suave';

  return (
    <>
      <button
        ref={boton}
        type="button"
        onClick={() => (pos ? cerrar() : abrir())}
        aria-haspopup="menu"
        aria-expanded={pos !== null}
        aria-controls={pos ? idPanel : undefined}
        title={venceEn ? 'Reprogramar' : 'Ponerle fecha'}
        className={className}
      >
        {children}
      </button>
      {pos &&
        createPortal(
          <div
            ref={panel}
            id={idPanel}
            role="menu"
            aria-label="Reprogramar"
            onKeyDown={teclas}
            style={{ left: pos.x, top: pos.y, transform: pos.arriba ? 'translateY(-100%)' : undefined }}
            className="animar-entrada fixed z-[60] w-64 rounded-md border border-borde bg-superficie p-1.5 text-texto shadow-xl"
          >
            <div className="px-3 pt-1.5 pb-1 text-[11px] font-bold tracking-wide text-texto-suave uppercase">
              {venceEn ? 'Reprogramar' : 'Ponerle fecha'}
            </div>
            {!eligiendo ? (
              <>
                {atajos.map((a) => {
                  const d = dia(a.n, horaActual);
                  return (
                    <button
                      key={a.nombre}
                      type="button"
                      role="menuitem"
                      onClick={() => elegir(d, Boolean(horaActual))}
                      className={opcion}
                    >
                      <Icon name={a.icono} size={15} className="text-texto-suave" />
                      <span className="mr-auto">{a.nombre}</span>
                      <span className="text-xs font-normal text-texto-suave">{corta.format(d)}</span>
                    </button>
                  );
                })}
                <div className="my-1.5 border-t border-borde" />
                <button type="button" role="menuitem" onClick={() => setEligiendo(true)} className={opcion}>
                  <Icon name="reloj" size={15} className="text-texto-suave" />
                  Elegir fecha y hora…
                </button>
                {venceEn && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => elegir(null, false)}
                    className={`${opcion} text-texto-suave`}
                  >
                    <Icon name="cerrar" size={15} />
                    Quitar fecha
                  </button>
                )}
              </>
            ) : (
              <form
                className="flex flex-col gap-2.5 p-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const d = new Date(`${fecha}T${conHora ? hora : '23:59'}`);
                  if (!Number.isNaN(d.getTime())) elegir(d, conHora);
                }}
              >
                <label className="flex flex-col gap-1 text-xs font-semibold text-texto-suave">
                  Fecha
                  <input
                    type="date"
                    required
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    className={control}
                  />
                </label>
                <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-[13px] font-semibold">
                  <input
                    type="checkbox"
                    checked={conHora}
                    onChange={(e) => setConHora(e.target.checked)}
                    className="size-4 accent-acento"
                  />
                  Con hora
                </label>
                {conHora && (
                  <input
                    type="time"
                    required
                    aria-label="Hora"
                    value={hora}
                    onChange={(e) => setHora(e.target.value)}
                    className={control}
                  />
                )}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="min-h-10 flex-1 cursor-pointer rounded-md bg-acento px-3 text-[13px] font-semibold text-sobre-acento hover:brightness-110"
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEligiendo(false)}
                    className="min-h-10 cursor-pointer rounded-md px-3 text-[13px] font-semibold text-texto-suave hover:bg-superficie-2"
                  >
                    Atrás
                  </button>
                </div>
              </form>
            )}
          </div>,
          pos.capa,
        )}
    </>
  );
}
