'use client';

import { useState, useTransition } from 'react';
import { Icon } from '@/components/Icon';
import { VentanaFlotante } from '@/components/VentanaFlotante';
import { eliminarCotizacion } from '../acciones';

/**
 * Eliminar la cotización (decisión 2026-10-05): sólo mientras no tenga precios autorizados. Pide confirmación; la base
 * vuelve a verificarlo y la auditoría conserva lo eliminado.
 */
export function EliminarCotizacion({
  cotizacionId,
  oportunidadId,
}: {
  cotizacionId: string;
  oportunidadId: string | null;
}) {
  const [abierta, setAbierta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-3 text-[13px] font-semibold text-texto-suave hover:bg-peligro-suave hover:text-peligro"
      >
        <Icon name="cerrar" size={15} />
        Eliminar cotización
      </button>
      {abierta && (
        <VentanaFlotante titulo="¿Eliminar esta cotización?" onCerrar={() => setAbierta(false)}>
          <div className="flex flex-col gap-4">
            <p className="text-sm">
              Se eliminan sus propuestas, partidas, costos y condiciones. No se puede deshacer. Sólo es
              posible mientras no tenga precios autorizados.
            </p>
            {error && <p className="text-[13px] font-semibold text-peligro">{error}</p>}
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                disabled={pendiente}
                onClick={() =>
                  iniciar(async () => {
                    // Si se elimina, la acción redirige a la oportunidad.
                    const r = await eliminarCotizacion(cotizacionId, oportunidadId);
                    if (r?.error) setError(r.error);
                  })
                }
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-peligro px-4 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
              >
                <Icon name="cerrar" size={16} />
                {pendiente ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
              <button
                type="button"
                onClick={() => setAbierta(false)}
                className="min-h-11 cursor-pointer rounded-md px-4 text-sm font-semibold text-texto-suave hover:bg-superficie-2"
              >
                Cancelar
              </button>
            </div>
          </div>
        </VentanaFlotante>
      )}
    </>
  );
}
