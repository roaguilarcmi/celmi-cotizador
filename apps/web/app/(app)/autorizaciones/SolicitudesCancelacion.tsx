'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Icon } from '@/components/Icon';
import { Boton, Tarjeta, Titulo2, clasesBoton } from '@/components/ui';
import type { SolicitudCancelacion } from '@/lib/datos';
import { haceCuanto } from '@/lib/presentacion';
import { resolverCancelacion } from '../cotizaciones/acciones';

/**
 * Solicitudes de cancelación pendientes (Fase 4 · D, mockup aprobado 2026-10-12): quien autoriza cancela la
 * cotización o rechaza la solicitud explicando por qué.
 */
export function SolicitudesCancelacion({ solicitudes }: { solicitudes: SolicitudCancelacion[] }) {
  if (!solicitudes.length) return null;
  return (
    <Tarjeta className="mb-6 overflow-hidden">
      <div className="flex items-center gap-3 border-b border-borde px-5 py-4">
        <Titulo2>Solicitudes de cancelación</Titulo2>
        <span className="tabular rounded-pill bg-peligro px-2.5 py-0.5 text-xs font-bold text-white">
          {solicitudes.length}
        </span>
      </div>
      <ul>
        {solicitudes.map((s) => (
          <Solicitud key={s.id} s={s} />
        ))}
      </ul>
    </Tarjeta>
  );
}

function Solicitud({ s }: { s: SolicitudCancelacion }) {
  const [rechazando, setRechazando] = useState(false);
  const [comentario, setComentario] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const cotizacionId = s.revision?.cotizacion_id ?? '';
  const op = s.revision?.cotizacion?.oportunidad;

  const resolver = (aprobar: boolean) =>
    iniciar(async () => {
      const r = await resolverCancelacion(s.id, cotizacionId, aprobar, comentario);
      if (r.error) setError(r.error);
    });

  return (
    <li className="border-b border-borde px-5 py-4 last:border-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-bold tabular">{s.revision?.folio}</span>
        <span className="text-[13px] text-texto-suave">
          {[op?.cliente?.razon_social, op?.nombre].filter(Boolean).join(' · ')}
        </span>
        <span className="ml-auto text-xs text-texto-suave">
          {s.solicitante?.nombre ?? '—'} · {haceCuanto(s.solicitada_en)}
        </span>
      </div>
      <p className="mt-1.5 rounded-md bg-superficie-2 px-3 py-2 text-[13px]">«{s.motivo}»</p>
      {rechazando ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <label htmlFor={`rechazo-${s.id}`} className="sr-only">
            Por qué no se cancela
          </label>
          <input
            id={`rechazo-${s.id}`}
            value={comentario}
            autoFocus
            autoComplete="off"
            maxLength={2000}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="¿Por qué no se cancela?"
            className="h-10 min-w-[280px] flex-1 rounded-md border-2 border-texto/20 bg-superficie px-3 text-sm outline-none focus:border-acento focus:ring-4 focus:ring-acento-suave"
          />
          <Boton tamano="chico" variante="secundario" disabled={pendiente} onClick={() => resolver(false)}>
            Rechazar solicitud
          </Boton>
          <Boton tamano="chico" variante="fantasma" onClick={() => setRechazando(false)}>
            Volver
          </Boton>
        </div>
      ) : (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Link
            href={`/cotizaciones/${cotizacionId}?paso=emision`}
            className={clasesBoton('fantasma', 'chico')}
          >
            <Icon name="abrir" size={16} /> Ver cotización
          </Link>
          <Boton tamano="chico" variante="secundario" className="ml-auto" onClick={() => setRechazando(true)}>
            Rechazar
          </Boton>
          <Boton
            tamano="chico"
            variante="peligroFuerte"
            icono="cerrar"
            disabled={pendiente}
            onClick={() => resolver(true)}
          >
            {pendiente ? 'Cancelando…' : 'Cancelar cotización'}
          </Boton>
        </div>
      )}
      {error && <p className="mt-2 text-xs font-semibold text-peligro">{error}</p>}
    </li>
  );
}
