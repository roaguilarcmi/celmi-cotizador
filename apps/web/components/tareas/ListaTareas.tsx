'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Icon } from '@/components/Icon';
import { TextoEnriquecido } from '@/components/TextoEnriquecido';
import { cambiarEstadoTarea } from '@/lib/acciones-tareas';
import type { TareaFila } from '@/lib/datos';
import { AvanceSubtareas } from './AvanceSubtareas';
import { DialogoTarea } from './DialogoTarea';
import { nombreAviso } from './FormularioTarea';

export { cuando, TONOS_CUANDO } from './cuando';
import { cuando, TONOS_CUANDO } from './cuando';

export function ListaTareas({
  tareas,
  mostrarOportunidad,
  compacta,
  vacio = 'Sin tareas pendientes.',
}: {
  tareas: TareaFila[];
  mostrarOportunidad?: boolean;
  /** Notas recortadas a unas líneas (ficha de la oportunidad). */
  compacta?: boolean;
  vacio?: string;
}) {
  const [verCerradas, setVerCerradas] = useState(false);
  const pendientes = tareas.filter((t) => t.estado === 'pendiente');
  const cerradas = tareas.filter((t) => t.estado !== 'pendiente');

  return (
    <div>
      {pendientes.length === 0 ? (
        vacio && <p className="py-3 text-[13px] text-texto-suave">{vacio}</p>
      ) : (
        <ul className="flex flex-col">
          {pendientes.map((t) => (
            <FilaTarea key={t.id} t={t} mostrarOportunidad={mostrarOportunidad} compacta={compacta} />
          ))}
        </ul>
      )}
      {cerradas.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setVerCerradas((v) => !v)}
            aria-expanded={verCerradas}
            className="min-h-9 cursor-pointer text-[13px] font-semibold text-texto-suave hover:text-texto"
          >
            {verCerradas ? 'Ocultar' : 'Ver'} completadas y canceladas ({cerradas.length})
          </button>
          {verCerradas && (
            <ul className="mt-1 flex flex-col opacity-75">
              {cerradas.map((t) => (
                <FilaTarea key={t.id} t={t} mostrarOportunidad={mostrarOportunidad} compacta={compacta} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Acciones de una tarea compartidas por la lista y el tablero. */
export function useAccionesTarea(t: TareaFila) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const cambiar = (estado: 'pendiente' | 'completada' | 'cancelada') =>
    iniciar(async () => {
      const r = await cambiarEstadoTarea(t.id, estado);
      setError(r.error ?? null);
    });
  return { pendiente, error, cambiar };
}

export function DetallesTarea({
  t,
  mostrarOportunidad,
  compacta,
}: {
  t: TareaFila;
  mostrarOportunidad?: boolean;
  compacta?: boolean;
}) {
  const hecha = t.estado === 'completada';
  const cancelada = t.estado === 'cancelada';
  const c = cuando(t.vence_en);
  return (
    <>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-texto-suave">
        {!hecha && !cancelada && (
          <span className={`rounded-pill px-2 py-0.5 font-semibold ${TONOS_CUANDO[c.tono]}`}>{c.texto}</span>
        )}
        {cancelada && <span>Cancelada</span>}
        {hecha && <span className="font-semibold text-exito">Completada</span>}
        {!hecha && !cancelada && t.avisos.length > 0 && (
          <span
            className="inline-flex items-center gap-1"
            title={t.avisos.map((a) => nombreAviso(a.minutos_antes)).join(', ')}
          >
            <Icon name="campana" size={13} />
            {t.avisos.length === 1 ? nombreAviso(t.avisos[0]!.minutos_antes) : `${t.avisos.length} avisos`}
          </span>
        )}
        <AvanceSubtareas tarea={t} />
        {mostrarOportunidad && t.oportunidad && (
          <Link
            href={`/oportunidades/${t.oportunidad.id}`}
            className="font-semibold text-acento-texto hover:underline"
          >
            {t.oportunidad.cliente?.razon_social ? `${t.oportunidad.cliente.razon_social} · ` : ''}
            {t.oportunidad.nombre}
          </Link>
        )}
      </div>
      {t.notas != null && (
        <div
          className={`mt-2 rounded-sm border-l-2 border-borde pl-3 text-texto-suave ${compacta ? 'recorte-notas max-h-[4.5em] overflow-hidden' : ''}`}
          title={compacta ? t.descripcion : undefined}
        >
          <TextoEnriquecido contenido={t.notas} respaldo={t.descripcion} />
        </div>
      )}
    </>
  );
}

function FilaTarea({
  t,
  mostrarOportunidad,
  compacta,
}: {
  t: TareaFila;
  mostrarOportunidad?: boolean;
  compacta?: boolean;
}) {
  const { pendiente, error, cambiar } = useAccionesTarea(t);
  const [editando, setEditando] = useState(false);
  const hecha = t.estado === 'completada';
  const cancelada = t.estado === 'cancelada';

  return (
    <li className="flex items-start gap-3 border-b border-borde py-3 last:border-0">
      <button
        type="button"
        role="checkbox"
        aria-checked={hecha}
        aria-label={hecha ? `Reabrir «${t.titulo}»` : `Marcar «${t.titulo}» como completada`}
        disabled={pendiente || cancelada}
        onClick={() => cambiar(hecha ? 'pendiente' : 'completada')}
        className={`mt-0.5 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 transition-colors disabled:cursor-not-allowed ${
          hecha ? 'border-exito bg-exito text-white' : 'border-texto/30 hover:border-exito'
        }`}
      >
        {hecha && <Icon name="palomita" size={14} strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-semibold ${hecha || cancelada ? 'text-texto-suave line-through' : ''}`}>
          {t.titulo}
        </div>
        <DetallesTarea t={t} mostrarOportunidad={mostrarOportunidad} compacta={compacta} />
        {error && <p className="mt-1 text-xs text-peligro">{error}</p>}
      </div>
      <div className="flex shrink-0 gap-1">
        {!cancelada && (
          <button
            type="button"
            onClick={() => setEditando(true)}
            aria-label={`Editar o reprogramar «${t.titulo}»`}
            title="Editar o reprogramar"
            className="inline-flex size-9 cursor-pointer items-center justify-center rounded-md text-texto-suave hover:bg-superficie-2 hover:text-texto"
          >
            <Icon name="herramienta" size={16} />
          </button>
        )}
        {!hecha && !cancelada && (
          <button
            type="button"
            onClick={() => cambiar('cancelada')}
            disabled={pendiente}
            aria-label={`Cancelar «${t.titulo}»`}
            title="Cancelar tarea"
            className="inline-flex size-9 cursor-pointer items-center justify-center rounded-md text-texto-suave hover:bg-superficie-2 hover:text-peligro"
          >
            <Icon name="cerrar" size={16} />
          </button>
        )}
        {cancelada && (
          <button
            type="button"
            onClick={() => cambiar('pendiente')}
            disabled={pendiente}
            className="min-h-9 cursor-pointer rounded-md px-2 text-xs font-semibold text-acento-texto hover:bg-acento-suave"
          >
            Reabrir
          </button>
        )}
      </div>
      {editando && <DialogoTarea tarea={t} onCerrar={() => setEditando(false)} />}
    </li>
  );
}
