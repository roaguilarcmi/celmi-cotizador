'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef } from 'react';
import { Icon, type IconName } from '../Icon';
import type { Tono } from '../ui';

export interface Emergente {
  id: string;
  titulo: string;
  cuerpo: string;
  enlace: string;
  tono: Tono;
}

const FONDO: Record<Tono, string> = {
  exito: 'bg-exito-suave text-exito',
  info: 'bg-info-suave text-info',
  peligro: 'bg-peligro-suave text-peligro',
  aviso: 'bg-aviso-suave text-aviso',
  neutro: 'bg-neutro-suave text-neutro',
};
const ICONO: Record<Tono, IconName> = {
  exito: 'autorizaciones',
  info: 'cotizaciones',
  peligro: 'campana',
  aviso: 'campana',
  neutro: 'campana',
};

const DURACION = 8000;

function Tarjeta({ e, onCerrar }: { e: Emergente; onCerrar: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onCerrar, DURACION);
    return () => window.clearTimeout(t);
  }, [onCerrar]);
  return (
    <div
      role="status"
      className="animar-entrada flex gap-3 rounded-lg border border-borde bg-superficie p-3.5 sombra"
    >
      <span
        className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full ${FONDO[e.tono]}`}
      >
        <Icon name={ICONO[e.tono]} size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] leading-snug font-bold">{e.titulo}</p>
        {e.cuerpo && <p className="mt-0.5 line-clamp-2 text-[12.5px] text-texto-suave">{e.cuerpo}</p>}
        {e.enlace && (
          <Link
            href={e.enlace}
            onClick={onCerrar}
            className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] font-semibold text-acento-texto hover:underline"
          >
            Abrir
            <Icon name="derecha" size={14} />
          </Link>
        )}
      </div>
      <button
        type="button"
        aria-label="Cerrar aviso"
        onClick={onCerrar}
        className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-texto-suave hover:bg-superficie-2"
      >
        <Icon name="cerrar" size={16} />
      </button>
    </div>
  );
}

/**
 * Avisos emergentes (Fase 8 · A): abajo a la derecha, máximo 3, se van solos a los 8 s. No toman el foco ni cierran
 * ventanas abiertas: se anuncian a los lectores de pantalla sin interrumpir.
 */
export function Emergentes({ lista, onCerrar }: { lista: Emergente[]; onCerrar: (id: string) => void }) {
  if (lista.length === 0) return null;
  return (
    <div
      aria-live="polite"
      className="fixed right-4 bottom-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2"
    >
      {lista.map((e) => (
        <TarjetaEstable key={e.id} e={e} onCerrar={onCerrar} />
      ))}
    </div>
  );
}

/** Evita reiniciar el temporizador de cada tarjeta cuando llega otra. */
function TarjetaEstable({ e, onCerrar }: { e: Emergente; onCerrar: (id: string) => void }) {
  const cerrar = useEstable(() => onCerrar(e.id));
  return <Tarjeta e={e} onCerrar={cerrar} />;
}

function useEstable(fn: () => void) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  return useCallback(() => ref.current(), []);
}
