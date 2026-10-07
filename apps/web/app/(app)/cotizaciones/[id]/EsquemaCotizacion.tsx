'use client';

import { useState, useTransition } from 'react';
import { Icon } from '@/components/Icon';
import { Tarjeta } from '@/components/ui';
import { partidasDeOtroProveedor } from '@/lib/corrida';
import type { RevisionDetalle } from '@/lib/datos';
import { TIPOS_OPORTUNIDAD, type TipoOportunidad } from '@/lib/tipos-oportunidad';
import { guardarEsquemaRevision } from '../acciones';

/**
 * Esquema de la cotización (decisión 2026-10-07): cada cotización puede tener uno distinto al de la oportunidad. En
 * arrendamiento se indica con qué mayorista se trabaja; si es distinto del proveedor de algunas partidas, se avisa
 * (quien autoriza considera el % de transaccionalidad). Se guarda al elegir.
 */
export function EsquemaCotizacion({
  revision,
  cotizacionId,
  editable,
  mayoristas,
}: {
  revision: RevisionDetalle;
  cotizacionId: string;
  editable: boolean;
  mayoristas: { id: string; nombre: string }[];
}) {
  const [esquema, setEsquema] = useState<TipoOportunidad>(revision.esquema);
  const [mayorista, setMayorista] = useState(revision.mayorista_arrendamiento_id ?? '');
  const [previa, setPrevia] = useState(revision);
  if (revision !== previa) {
    setPrevia(revision);
    setEsquema(revision.esquema);
    setMayorista(revision.mayorista_arrendamiento_id ?? '');
  }
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null);
  const [pendiente, iniciar] = useTransition();

  const guardar = (nuevo: TipoOportunidad, nuevoMayorista: string) => {
    setEsquema(nuevo);
    setMayorista(nuevoMayorista);
    iniciar(async () => {
      const r = await guardarEsquemaRevision(revision.id, cotizacionId, {
        esquema: nuevo,
        mayorista_arrendamiento_id: nuevo === 'arrendamiento' && nuevoMayorista ? nuevoMayorista : null,
      });
      setMensaje(r.error ? { texto: r.error, error: true } : { texto: 'Guardado' });
    });
  };

  // Con el estado local (la revisión del servidor se actualiza al guardar).
  const diferentes = partidasDeOtroProveedor({
    ...revision,
    esquema,
    mayorista_arrendamiento_id: mayorista || null,
  });

  return (
    <Tarjeta className="mb-4 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span className="text-[13px] font-bold">Esquema de esta cotización</span>
        <div role="radiogroup" aria-label="Esquema de la cotización" className="flex flex-wrap gap-1.5">
          {(Object.keys(TIPOS_OPORTUNIDAD) as TipoOportunidad[]).map((t) => {
            const activo = esquema === t;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={activo}
                disabled={!editable || pendiente}
                onClick={() => guardar(t, mayorista)}
                className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border-2 px-3.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed ${
                  activo
                    ? 'border-acento bg-acento-suave/60 text-acento-texto'
                    : 'border-borde text-texto-suave hover:border-acento/40 hover:text-texto'
                }`}
              >
                {activo && <Icon name="palomita" size={14} strokeWidth={2.6} />}
                {TIPOS_OPORTUNIDAD[t].nombre}
              </button>
            );
          })}
        </div>
        {esquema === 'arrendamiento' && (
          <label className="flex items-center gap-2 text-[13px] font-semibold">
            Mayorista del arrendamiento
            <select
              value={mayorista}
              disabled={!editable || pendiente}
              onChange={(e) => guardar(esquema, e.target.value)}
              aria-invalid={!mayorista}
              className={`h-10 rounded-md border-2 bg-superficie px-3 text-sm font-normal text-texto outline-none focus:border-acento disabled:bg-superficie-2 ${
                mayorista ? 'border-borde' : 'border-aviso'
              }`}
            >
              <option value="">Elige…</option>
              {mayoristas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        {mensaje && (
          <span className={`text-xs font-semibold ${mensaje.error ? 'text-peligro' : 'text-exito'}`}>
            {pendiente ? 'Guardando…' : mensaje.texto}
          </span>
        )}
      </div>
      {esquema === 'arrendamiento' && !mayorista && editable && (
        <p className="mt-2 text-xs text-aviso">
          Indica el mayorista del arrendamiento para enviar a autorización.
        </p>
      )}
      {diferentes.length > 0 && (
        <p className="mt-2 flex items-center gap-2 rounded-md bg-aviso-suave px-3 py-2 text-[13px] text-aviso">
          <Icon name="campana" size={16} />
          {diferentes.length} {diferentes.length === 1 ? 'partida tiene' : 'partidas tienen'} un proveedor
          distinto del mayorista del arrendamiento: quien autoriza considerará el % de transaccionalidad.
        </p>
      )}
    </Tarjeta>
  );
}
