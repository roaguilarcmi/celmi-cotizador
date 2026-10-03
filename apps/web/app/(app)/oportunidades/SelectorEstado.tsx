'use client';

import { useState, useTransition } from 'react';
import { Pill } from '@/components/ui';
import type { Estado } from '@/lib/datos';
import { tonoEstado } from '@/lib/presentacion';
import { cambiarEstado } from './acciones';

/** Estado de la oportunidad: menú para quien puede cambiarlo; etiqueta de sólo lectura para los demás. */
export function SelectorEstado({
  oportunidadId,
  estadoId,
  estados,
  puedeCambiar,
  onCambio,
  compacto,
}: {
  oportunidadId: string;
  estadoId: string;
  estados: Estado[];
  puedeCambiar: boolean;
  onCambio?: (estado: string, error?: string) => void;
  compacto?: boolean;
}) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const actual = estados.find((e) => e.id === estadoId);

  if (!puedeCambiar) return <Pill tono={tonoEstado(estadoId)}>{actual?.nombre ?? estadoId}</Pill>;

  return (
    <span className="inline-flex flex-col gap-1">
      <label className="sr-only" htmlFor={`estado-${oportunidadId}`}>
        Estado de la oportunidad
      </label>
      <select
        id={`estado-${oportunidadId}`}
        value={estadoId}
        disabled={pendiente}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const nuevo = e.target.value;
          setError(null);
          onCambio?.(nuevo);
          iniciar(async () => {
            const r = await cambiarEstado(oportunidadId, nuevo);
            if (r.error) {
              setError(r.error);
              onCambio?.(estadoId, r.error);
            }
          });
        }}
        className={`cursor-pointer rounded-pill border border-borde bg-superficie font-semibold text-texto outline-none focus:border-acento disabled:opacity-60 ${
          compacto ? 'h-8 px-2.5 text-xs' : 'h-10 px-3.5 text-[13px]'
        }`}
      >
        {estados.map((e) => (
          <option key={e.id} value={e.id}>
            {e.nombre}
          </option>
        ))}
      </select>
      {error && !onCambio && <span className="text-xs text-peligro">{error}</span>}
    </span>
  );
}
