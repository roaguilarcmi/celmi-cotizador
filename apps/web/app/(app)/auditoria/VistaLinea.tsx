'use client';

import { useState } from 'react';
import { DetalleAccion, Frase, HORA, IconoAccion, porDia, textoCambios } from '@/components/auditoria/Piezas';
import { Icon } from '@/components/Icon';
import { VentanaFlotante } from '@/components/VentanaFlotante';
import type { AccionVista } from '@/lib/auditoria';

/** Vista A · Línea de tiempo narrada: cada acción como frase, agrupada por día; el detalle se abre en una ventana. */
export function VistaLinea({ acciones }: { acciones: AccionVista[] }) {
  const [abierta, setAbierta] = useState<AccionVista | null>(null);
  if (acciones.length === 0)
    return (
      <p className="px-6 py-14 text-center text-sm text-texto-suave">No hay registros con estos filtros.</p>
    );
  return (
    <div className="px-6 pb-4">
      {porDia(acciones).map((dia) => (
        <section key={dia.titulo} className="mt-3">
          <h2 className="mb-1 text-[12px] font-bold tracking-wide text-texto-suave uppercase first-letter:uppercase">
            {dia.titulo}
          </h2>
          <ul className="relative before:absolute before:top-4 before:bottom-4 before:left-[76px] before:w-px before:bg-borde max-sm:before:hidden">
            {dia.items.map((a) => (
              <li key={a.clave} className="relative flex items-start gap-3 py-2.5 pl-1">
                <span className="tabular w-11 shrink-0 pt-1.5 text-right text-[12px] text-texto-suave max-sm:hidden">
                  {HORA.format(new Date(a.en))}
                </span>
                <IconoAccion a={a} />
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-[14px] leading-snug">
                    <Frase a={a} />
                  </p>
                  <p className="mt-0.5 truncate text-[12.5px] text-texto-suave">
                    <span className="sm:hidden">
                      {HORA.format(new Date(a.en))}
                      {a.contexto && ' · '}
                    </span>
                    {a.contexto}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAbierta(a)}
                  className="inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold text-texto-suave hover:bg-superficie-2 hover:text-texto"
                >
                  {a.cambios.length ? textoCambios(a.cambios.length) : 'Ver'}
                  <Icon name="derecha" size={16} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {abierta && (
        <VentanaFlotante titulo="Detalle del cambio" onCerrar={() => setAbierta(null)}>
          <DetalleAccion a={abierta} />
        </VentanaFlotante>
      )}
    </div>
  );
}
