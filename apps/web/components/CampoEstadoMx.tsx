'use client';

import { ESTADOS_MX } from '@celmi/validation';
import { useId } from 'react';

/** Lista de estados de la República (decisión 2026-10-07: en lugar de «Ciudad» como texto libre). */
export function CampoEstadoMx({
  etiqueta,
  name,
  defaultValue,
  ayuda,
}: {
  etiqueta: string;
  name: string;
  defaultValue?: string | null;
  ayuda?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold">
        {etiqueta}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue ?? ''}
        className="h-12 rounded-md border border-borde bg-superficie px-3 text-[15px] text-texto outline-none focus:border-acento focus:ring-4 focus:ring-acento-suave"
      >
        <option value="">Elige un estado…</option>
        {ESTADOS_MX.map((e) => (
          <option key={e} value={e}>
            {e}
          </option>
        ))}
      </select>
      {ayuda && <span className="text-xs text-texto-suave">{ayuda}</span>}
    </div>
  );
}
