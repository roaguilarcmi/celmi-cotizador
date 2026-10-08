'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { marcarNotificacionesLeidas } from '@/lib/acciones-notificaciones';
import type { Notificacion } from '@/lib/datos';
import { haceCuanto } from '@/lib/presentacion';
import { Icon } from './Icon';

/**
 * Avisos dentro de la app (0027), en la campana del menú: p. ej. «cotización retirada para corregir», que llega a
 * quien la capturó y al ejecutivo. Abrir un aviso lo marca como leído.
 */
export function Notificaciones({ avisos }: { avisos: Notificacion[] }) {
  const [abierto, setAbierto] = useState(false);
  const [, iniciar] = useTransition();
  const caja = useRef<HTMLDivElement>(null);
  const sinLeer = avisos.filter((a) => !a.leida_en).length;

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  const leer = (ids?: string[]) => iniciar(async () => void (await marcarNotificacionesLeidas(ids)));

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((x) => !x)}
        aria-expanded={abierto}
        aria-label={sinLeer ? `Avisos: ${sinLeer} sin leer` : 'Avisos'}
        title="Avisos"
        className="relative inline-flex size-9 cursor-pointer items-center justify-center rounded-md text-nav-texto transition-colors hover:bg-white/10 hover:text-white"
      >
        <Icon name="campana" size={18} />
        {sinLeer > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4.5 rounded-pill bg-[#F5B544] px-1 text-center text-[10px] leading-4.5 font-bold text-[#2B1B00]">
            {sinLeer}
          </span>
        )}
      </button>

      {abierto && (
        <div
          role="dialog"
          aria-label="Avisos"
          className="animar-entrada absolute top-full right-0 z-50 mt-2 w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-borde bg-superficie text-texto sombra lg:right-auto lg:left-0"
        >
          <div className="flex items-center gap-2 border-b border-borde px-4 py-3">
            <span className="mr-auto text-sm font-bold">Avisos</span>
            {sinLeer > 0 && (
              <button
                type="button"
                onClick={() => leer()}
                className="cursor-pointer text-xs font-semibold text-acento-texto hover:underline"
              >
                Marcar todos como leídos
              </button>
            )}
          </div>
          {avisos.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-texto-suave">No tienes avisos.</p>
          ) : (
            <ul className="max-h-[min(60vh,480px)] overflow-y-auto">
              {avisos.map((a) => (
                <li key={a.id} className="border-b border-borde last:border-0">
                  <Link
                    href={a.enlace || '/'}
                    onClick={() => {
                      setAbierto(false);
                      if (!a.leida_en) leer([a.id]);
                    }}
                    className={`flex gap-3 px-4 py-3 hover:bg-superficie-2 ${a.leida_en ? '' : 'bg-aviso-suave/40'}`}
                  >
                    <span
                      className={`mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full ${
                        a.leida_en ? 'bg-neutro-suave text-neutro' : 'bg-aviso-suave text-aviso'
                      }`}
                    >
                      <Icon name="campana" size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] leading-snug font-semibold">{a.titulo}</span>
                      {a.cuerpo && (
                        <span className="mt-0.5 line-clamp-3 block text-xs text-texto-suave">{a.cuerpo}</span>
                      )}
                      <span className="mt-1 block text-[11px] text-texto-suave">
                        {haceCuanto(a.creado_en)}
                      </span>
                    </span>
                    {!a.leida_en && (
                      <span className="mt-2 size-2 shrink-0 rounded-full bg-aviso" aria-label="Sin leer" />
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
