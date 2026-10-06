'use client';

import { useState, useTransition } from 'react';
import { Boton } from '@/components/ui';
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
      <Boton variante="peligro" tamano="chico" icono="cerrar" onClick={() => setAbierta(true)}>
        Eliminar cotización
      </Boton>
      {abierta && (
        <VentanaFlotante titulo="¿Eliminar esta cotización?" onCerrar={() => setAbierta(false)}>
          <div className="flex flex-col gap-4">
            <p className="text-sm">
              Se eliminan sus propuestas, partidas, costos y condiciones. No se puede deshacer. Sólo es
              posible mientras no tenga precios autorizados.
            </p>
            {error && <p className="text-[13px] font-semibold text-peligro">{error}</p>}
            <div className="flex flex-wrap gap-2.5">
              <Boton
                variante="peligroFuerte"
                icono="cerrar"
                disabled={pendiente}
                onClick={() =>
                  iniciar(async () => {
                    // Si se elimina, la acción redirige a la oportunidad.
                    const r = await eliminarCotizacion(cotizacionId, oportunidadId);
                    if (r?.error) setError(r.error);
                  })
                }
              >
                {pendiente ? 'Eliminando…' : 'Sí, eliminar'}
              </Boton>
              <Boton variante="fantasma" onClick={() => setAbierta(false)}>
                Cancelar
              </Boton>
            </div>
          </div>
        </VentanaFlotante>
      )}
    </>
  );
}
