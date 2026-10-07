'use client';

import { useId, useState, type ReactNode } from 'react';

/** «1234567.8» → «1,234,567.80» (sólo para mostrar). */
export function conSeparadores(valor: string, decimales = 2): string {
  if (!/^\d+(\.\d+)?$/.test(valor)) return valor;
  const [entero = '0', dec = ''] = valor.split('.');
  const miles = entero.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimales > 0
    ? `${miles}.${dec.padEnd(decimales, '0').slice(0, Math.max(decimales, dec.length))}`
    : miles;
}

/**
 * Campo de importe (decisión 2026-10-07): mientras se escribe acepta sólo dígitos y un punto decimal; al salir del
 * campo se muestra con separadores de miles («1,234,567.89»). El valor que guarda la pantalla es el limpio
 * («1234567.89»).
 */
export function CampoMoneda({
  etiqueta,
  valor,
  onCambio,
  disabled,
  decimales = 2,
  prefijo = '$',
  sufijo,
  ayuda,
  invalido,
}: {
  etiqueta: ReactNode;
  valor: string;
  onCambio: (valor: string) => void;
  disabled?: boolean;
  decimales?: number;
  prefijo?: string;
  sufijo?: string;
  ayuda?: string;
  invalido?: boolean;
}) {
  const id = useId();
  const [enfocado, setEnfocado] = useState(false);
  const mostrado = enfocado || !valor ? valor : conSeparadores(valor, decimales);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold text-texto">
        {etiqueta}
      </label>
      <div
        className={`flex h-11 items-center rounded-md border bg-superficie text-sm focus-within:border-acento focus-within:ring-4 focus-within:ring-acento-suave ${
          invalido ? 'border-peligro' : 'border-texto/25'
        } ${disabled ? 'bg-superficie-2 opacity-80' : ''}`}
      >
        {prefijo && <span className="pl-3 text-texto-suave">{prefijo}</span>}
        <input
          id={id}
          value={mostrado}
          disabled={disabled}
          inputMode="decimal"
          // Datos de una cotización: el navegador no los guarda en su historial de formularios (2026-10-07).
          autoComplete="off"
          aria-invalid={invalido}
          onFocus={() => setEnfocado(true)}
          onBlur={() => setEnfocado(false)}
          onChange={(e) => {
            const limpio = e.target.value.replace(/,/g, '').replace(/[^\d.]/g, '');
            const [entero = '', ...resto] = limpio.split('.');
            onCambio(resto.length ? `${entero}.${resto.join('').slice(0, decimales)}` : entero);
          }}
          className="tabular h-full min-w-0 flex-1 bg-transparent px-2 text-right text-texto outline-none"
        />
        {sufijo && <span className="pr-3 text-texto-suave">{sufijo}</span>}
      </div>
      {ayuda && <span className="text-[11px] text-texto-suave">{ayuda}</span>}
    </div>
  );
}
