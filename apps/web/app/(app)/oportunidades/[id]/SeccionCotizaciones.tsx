'use client';

import { useState, useTransition } from 'react';
import { Icon } from '@/components/Icon';
import { Tarjeta, Titulo2 } from '@/components/ui';
import type { CotizacionFila } from '@/lib/datos';
import { crearCotizacion } from '../../cotizaciones/acciones';
import { ListaCotizaciones } from '../../cotizaciones/ListaCotizaciones';

/** Cotizaciones de la oportunidad y «Nueva cotización» (abre el wizard en el paso Partidas). */
export function SeccionCotizaciones({
  oportunidadId,
  cotizaciones,
  puedeCrear,
}: {
  oportunidadId: string;
  cotizaciones: CotizacionFila[];
  puedeCrear: boolean;
}) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Tarjeta className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Titulo2>Cotizaciones</Titulo2>
        {puedeCrear && (
          <button
            type="button"
            disabled={pendiente}
            onClick={() =>
              iniciar(async () => {
                // Si todo sale bien, la acción redirige al wizard.
                const r = await crearCotizacion(oportunidadId);
                if (r?.error) setError(r.error);
              })
            }
            className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md bg-acento px-4 text-sm font-semibold text-sobre-acento hover:brightness-110 disabled:opacity-60"
          >
            <Icon name="mas" strokeWidth={2.2} />
            {pendiente ? 'Creando…' : 'Nueva cotización'}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-peligro">{error}</p>}
      <div className="mt-3">
        <ListaCotizaciones
          cotizaciones={cotizaciones}
          vacio="Aún no hay cotizaciones. Crea la primera con «Nueva cotización»: podrás pegar las partidas desde tu Solicitud de precios."
        />
      </div>
    </Tarjeta>
  );
}
