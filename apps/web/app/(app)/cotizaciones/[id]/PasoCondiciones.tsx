'use client';

import type { JSONContent } from '@tiptap/core';
import { useActionState, useState } from 'react';
import { EditorEnriquecido } from '@/components/EditorEnriquecido';
import { Icon } from '@/components/Icon';
import { TextoEnriquecido } from '@/components/TextoEnriquecido';
import { Tarjeta, Titulo2 } from '@/components/ui';
import type { RevisionDetalle } from '@/lib/datos';
import { guardarCondiciones, type Resultado } from '../acciones';

const dos = (n: number) => String(n).padStart(2, '0');
/** Valor para <input type="datetime-local"> en la hora local del navegador. */
const aLocal = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`;
};
const fechaLarga = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'America/Mexico_City',
});

/**
 * Paso «Condiciones comerciales»: vigencia (fecha y hora, como en el PDF de EPOXEMEX) y condiciones con formato
 * (viñetas con fragmentos en negritas). Se capturan antes de enviar a autorización.
 */
export function PasoCondiciones({
  revision,
  cotizacionId,
  editable,
}: {
  revision: RevisionDetalle;
  cotizacionId: string;
  editable: boolean;
}) {
  const [estado, accion, pendiente] = useActionState<Resultado, FormData>(
    async (previo: Resultado, datos: FormData) => {
      const local = String(datos.get('vigencia_local') ?? '');
      // Se envía el instante exacto: el navegador conoce la zona horaria de quien captura.
      datos.set('vigencia_hasta', local ? new Date(local).toISOString() : '');
      return guardarCondiciones(revision.id, cotizacionId, previo, datos);
    },
    {},
  );
  const [vigencia, setVigencia] = useState(aLocal(revision.vigencia_hasta));

  if (!editable)
    return (
      <Tarjeta className="p-6">
        <Titulo2>Condiciones comerciales</Titulo2>
        <dl className="mt-4 flex flex-col gap-4 text-sm">
          <div>
            <dt className="text-xs font-semibold text-texto-suave">Vigencia</dt>
            <dd className="mt-0.5 font-semibold">
              {revision.vigencia_hasta ? fechaLarga.format(new Date(revision.vigencia_hasta)) : 'Sin definir'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-texto-suave">Condiciones</dt>
            <dd className="mt-1">
              {revision.condiciones ? (
                <TextoEnriquecido contenido={revision.condiciones} respaldo="" />
              ) : (
                'Sin condiciones'
              )}
            </dd>
          </div>
        </dl>
      </Tarjeta>
    );

  return (
    <Tarjeta className="p-6">
      <Titulo2>Condiciones comerciales</Titulo2>
      <p className="mt-1 text-[13px] text-texto-suave">
        Aparecen al final de la cotización. Quien autoriza las revisa junto con los precios.
      </p>
      <form action={accion} className="mt-5 flex flex-col gap-5">
        <input type="hidden" name="vigencia_local" value={vigencia} />
        <label className="flex w-fit flex-col gap-1.5 text-xs font-semibold text-texto-suave">
          Vigencia de la cotización
          <input
            type="datetime-local"
            value={vigencia}
            onChange={(e) => setVigencia(e.target.value)}
            className="h-11 rounded-md border-2 border-texto/20 bg-superficie px-3 text-sm text-texto outline-none focus:border-acento focus:ring-4 focus:ring-acento-suave"
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-texto-suave">Condiciones</span>
          <EditorEnriquecido
            nombre="condiciones"
            inicial={(revision.condiciones as JSONContent | null) ?? null}
            etiqueta="Condiciones comerciales"
            placeholder="Forma de pago, garantía, entrega, vigencia… Usa viñetas y negritas como en tus cotizaciones."
            minAlto={180}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pendiente}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-acento px-4 text-sm font-semibold text-sobre-acento hover:brightness-110 disabled:opacity-60"
          >
            <Icon name="guardado" size={16} />
            {pendiente ? 'Guardando…' : 'Guardar condiciones'}
          </button>
          {estado.error && <span className="text-xs text-peligro">{estado.error}</span>}
          {estado.ok && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-exito">
              <Icon name="palomita" size={14} strokeWidth={2.6} />
              {estado.ok}
            </span>
          )}
        </div>
      </form>
    </Tarjeta>
  );
}
