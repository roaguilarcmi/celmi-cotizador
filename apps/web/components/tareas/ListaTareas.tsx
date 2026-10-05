'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Icon } from '@/components/Icon';
import { TextoEnriquecido } from '@/components/TextoEnriquecido';
import { cambiarEstadoTarea, moverTareaAEtapa, reprogramarTarea } from '@/lib/acciones-tareas';
import type { TareaFila } from '@/lib/datos';
import { COLORES_ETAPA, estaAbierta, etapaDe, type EstadoTarea } from '@/lib/etapas-tareas';
import { AvanceSubtareas } from './AvanceSubtareas';
import { cuando, TONOS_CUANDO } from './cuando';
import { DialogoTarea } from './DialogoTarea';
import { useEtapas } from './EtapasContexto';
import { nombreAviso } from './FormularioTarea';
import { alClicLibre } from './clicLibre';
import { MenuTarea } from './MenuTarea';
import { SelectorFecha } from './SelectorFecha';

export { cuando, TONOS_CUANDO } from './cuando';

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
  const abiertas = tareas.filter((t) => estaAbierta(t.estado));
  const cerradas = tareas.filter((t) => !estaAbierta(t.estado));

  return (
    <div>
      {abiertas.length === 0 ? (
        vacio && <p className="py-3 text-[13px] text-texto-suave">{vacio}</p>
      ) : (
        <ul className="flex flex-col">
          {abiertas.map((t) => (
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
  const cambiar = (estado: EstadoTarea) =>
    iniciar(async () => {
      const r = await cambiarEstadoTarea(t.id, estado);
      setError(r.error ?? null);
    });
  const moverA = (etapaId: string) =>
    iniciar(async () => {
      const r = await moverTareaAEtapa(t.id, etapaId);
      setError(r.error ?? null);
    });
  const reprogramar = (venceEn: string | null, sinHora: boolean) =>
    iniciar(async () => {
      const r = await reprogramarTarea(t.id, venceEn, sinHora);
      setError(r.error ?? null);
    });
  return { pendiente, error, cambiar, moverA, reprogramar };
}

/**
 * Etiquetas de la tarea. La fecha es un botón que abre «Reprogramar» (decisión 2026-10-05: lo que uno espera al tocar
 * una fecha); «Sin fecha» también, para ponerle una.
 */
export function DetallesTarea({
  t,
  mostrarOportunidad,
  mostrarEtapa,
  compacta,
  onReprogramar,
}: {
  t: TareaFila;
  mostrarOportunidad?: boolean;
  /** En la lista (sin columnas) se indica la etapa; en el tablero ya la dice la columna. */
  mostrarEtapa?: boolean;
  compacta?: boolean;
  onReprogramar: (venceEn: string | null, sinHora: boolean) => void;
}) {
  const hecha = t.estado === 'completada';
  const cancelada = t.estado === 'cancelada';
  const c = cuando(t.vence_en, t.sin_hora);
  const etapa = etapaDe(t, useEtapas());
  return (
    <>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-texto-suave">
        {!hecha && !cancelada && (
          <SelectorFecha
            venceEn={t.vence_en}
            sinHora={t.sin_hora}
            onCambiar={onReprogramar}
            className={`inline-flex min-h-7 cursor-pointer items-center gap-1 rounded-pill px-2.5 font-semibold transition-[box-shadow] hover:ring-2 hover:ring-acento/40 ${TONOS_CUANDO[c.tono]}`}
          >
            <Icon name="reloj" size={12} />
            {c.texto}
          </SelectorFecha>
        )}
        {(hecha || cancelada) && (
          <span className={`font-semibold ${hecha ? 'text-exito' : ''}`}>
            {hecha ? 'Completada' : 'Cancelada'}
          </span>
        )}
        {mostrarEtapa && etapa && !hecha && !cancelada && (
          <span
            className={`inline-flex items-center gap-1.5 font-semibold ${COLORES_ETAPA[etapa.color].texto}`}
          >
            <span aria-hidden="true" className={`size-2 rounded-full ${COLORES_ETAPA[etapa.color].punto}`} />
            {etapa.nombre}
          </span>
        )}
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
  const { pendiente, error, cambiar, moverA, reprogramar } = useAccionesTarea(t);
  const [abierta, setAbierta] = useState(false);
  const hecha = t.estado === 'completada';
  const cancelada = t.estado === 'cancelada';

  return (
    <li
      onClick={alClicLibre(() => setAbierta(true))}
      className={`group -mx-2 flex cursor-pointer items-start gap-3 rounded-md border-b border-borde px-2 py-3 transition-colors last:border-0 hover:bg-superficie-2/70 ${pendiente ? 'opacity-60' : ''}`}
    >
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
        <MenuTarea
          titulo={t.titulo}
          estado={t.estado}
          etapaId={t.etapa_id}
          onMover={moverA}
          onCancelar={() => cambiar('cancelada')}
          onAbrir={() => setAbierta(true)}
          className={`text-sm font-semibold ${hecha || cancelada ? 'text-texto-suave line-through' : ''}`}
        />
        <DetallesTarea
          t={t}
          mostrarOportunidad={mostrarOportunidad}
          mostrarEtapa
          compacta={compacta}
          onReprogramar={reprogramar}
        />
        {error && <p className="mt-1 text-xs text-peligro">{error}</p>}
      </div>
      <BotonAbrir titulo={t.titulo} onAbrir={() => setAbierta(true)} />
      {abierta && <DialogoTarea tarea={t} onCerrar={() => setAbierta(false)} />}
    </li>
  );
}

/** «Abrir detalle» explícito: aparece al pasar el mouse o con el foco, y siempre en pantallas táctiles. */
export function BotonAbrir({ titulo, onAbrir }: { titulo: string; onAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label={`Abrir detalle de «${titulo}»`}
      title="Abrir detalle"
      className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-texto-suave opacity-100 transition-opacity hover:bg-superficie hover:text-texto focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100"
    >
      <Icon name="abrir" size={15} />
    </button>
  );
}
