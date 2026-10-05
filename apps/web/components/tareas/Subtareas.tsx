'use client';

import { useRef, useState, useTransition } from 'react';
import { Icon } from '@/components/Icon';
import { VentanaFlotante } from '@/components/VentanaFlotante';
import { cambiarEstadoTarea, crearSubtarea } from '@/lib/acciones-tareas';
import type { SubtareaFila, TareaFila } from '@/lib/datos';
import type { EstadoTarea } from '@/lib/etapas-tareas';
import { FormularioTarea } from './FormularioTarea';
import { subtareasVigentes } from './AvanceSubtareas';
import { cuando, TONOS_CUANDO } from './cuando';

/** Lista de subtareas de una tarea existente, con agregado rápido y detalle de cada una. */
export function Subtareas({ tarea }: { tarea: TareaFila }) {
  const vigentes = subtareasVigentes(tarea);
  const hechas = vigentes.filter((s) => s.estado === 'completada').length;
  const [abierta, setAbierta] = useState<string | null>(null);
  const subAbierta = vigentes.find((s) => s.id === abierta);

  return (
    <section aria-labelledby={`subtareas-${tarea.id}`} className="mt-6 border-t border-borde pt-5">
      <div className="mb-2 flex items-center gap-3">
        <h3 id={`subtareas-${tarea.id}`} className="text-sm font-bold">
          Subtareas
        </h3>
        {vigentes.length > 0 && (
          <>
            <span className="tabular text-xs font-semibold text-texto-suave">
              {hechas} de {vigentes.length}
            </span>
            <span aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-pill bg-superficie-2">
              <span
                className="block h-full rounded-pill bg-exito transition-[width] duration-300"
                style={{ width: `${(hechas / vigentes.length) * 100}%` }}
              />
            </span>
          </>
        )}
      </div>

      {vigentes.length > 0 && (
        <ul className="flex flex-col">
          {vigentes.map((s) => (
            <FilaSubtarea key={s.id} s={s} onAbrir={() => setAbierta(s.id)} />
          ))}
        </ul>
      )}
      <AgregarSubtarea padreId={tarea.id} />

      {subAbierta && (
        <VentanaFlotante
          titulo="Subtarea"
          detalle={`De «${tarea.titulo}»`}
          esEdicion
          onCerrar={() => setAbierta(null)}
        >
          <FormularioTarea tarea={subAbierta} esSubtarea onListo={() => setAbierta(null)} />
          <EstadoSubtarea s={subAbierta} onCancelada={() => setAbierta(null)} />
        </VentanaFlotante>
      )}
    </section>
  );
}

function FilaSubtarea({ s, onAbrir }: { s: SubtareaFila; onAbrir: () => void }) {
  const [pendiente, iniciar] = useTransition();
  const hecha = s.estado === 'completada';
  const c = s.vence_en ? cuando(s.vence_en, s.sin_hora) : null;
  return (
    <li
      className={`group flex min-h-11 items-center gap-2.5 border-b border-borde/70 px-1 last:border-0 ${pendiente ? 'opacity-60' : ''}`}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={hecha}
        aria-label={hecha ? `Reabrir «${s.titulo}»` : `Completar «${s.titulo}»`}
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => void (await cambiarEstadoTarea(s.id, hecha ? 'pendiente' : 'completada')))
        }
        className={`inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 transition-colors ${
          hecha ? 'border-exito bg-exito text-white' : 'border-texto/30 hover:border-exito'
        }`}
      >
        {hecha && <Icon name="palomita" size={11} strokeWidth={3} />}
      </button>
      <button
        type="button"
        onClick={onAbrir}
        className={`min-h-10 min-w-0 flex-1 cursor-pointer truncate text-left text-sm ${hecha ? 'text-texto-suave line-through' : ''}`}
        title="Abrir subtarea"
      >
        {s.titulo}
      </button>
      {s.notas != null && (
        <span title="Tiene notas" className="text-texto-suave">
          <Icon name="cotizaciones" size={14} />
        </span>
      )}
      {s.avisos.length > 0 && !hecha && (
        <span title={`${s.avisos.length} aviso(s)`} className="text-texto-suave">
          <Icon name="campana" size={14} />
        </span>
      )}
      {c && !hecha && (
        <span className={`shrink-0 rounded-pill px-2 py-0.5 text-xs font-semibold ${TONOS_CUANDO[c.tono]}`}>
          {c.texto}
        </span>
      )}
      <button
        type="button"
        onClick={onAbrir}
        aria-label={`Abrir «${s.titulo}»`}
        className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-texto-suave opacity-60 group-hover:opacity-100 hover:bg-superficie-2"
      >
        <Icon name="derecha" size={15} />
      </button>
    </li>
  );
}

/** Agregado rápido: escribe y Enter, como en Asana. El foco se queda para capturar varias seguidas. */
function AgregarSubtarea({ padreId }: { padreId: string }) {
  const campo = useRef<HTMLInputElement>(null);
  const [titulo, setTitulo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const agregar = () => {
    const t = titulo.trim();
    if (!t) return;
    iniciar(async () => {
      const r = await crearSubtarea(padreId, t);
      if (r.error) setError(r.error);
      else {
        setError(null);
        setTitulo('');
        campo.current?.focus();
      }
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        agregar();
      }}
      className="mt-1"
    >
      <div className="flex min-h-11 items-center gap-2.5 px-1">
        <span className="inline-flex size-5 shrink-0 items-center justify-center text-acento-texto">
          <Icon name="mas" size={16} strokeWidth={2.4} />
        </span>
        <label htmlFor={`nueva-sub-${padreId}`} className="sr-only">
          Agregar subtarea
        </label>
        <input
          ref={campo}
          id={`nueva-sub-${padreId}`}
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          maxLength={200}
          autoComplete="off"
          disabled={pendiente}
          placeholder="Agregar subtarea y presionar Enter"
          className="h-10 min-w-0 flex-1 rounded-md border-2 border-dashed border-texto/15 bg-transparent px-3 text-sm outline-none placeholder:text-texto-suave focus:border-solid focus:border-acento focus:bg-superficie focus:ring-4 focus:ring-acento-suave"
        />
        {titulo.trim() && (
          <button
            type="submit"
            disabled={pendiente}
            className="min-h-10 cursor-pointer rounded-md bg-acento px-3 text-[13px] font-semibold text-sobre-acento hover:brightness-110 disabled:opacity-60"
          >
            {pendiente ? 'Agregando…' : 'Agregar'}
          </button>
        )}
      </div>
      {error && <p className="mt-1 pl-9 text-xs text-peligro">{error}</p>}
    </form>
  );
}

/** Completar, reabrir o cancelar la subtarea abierta. */
function EstadoSubtarea({ s, onCancelada }: { s: SubtareaFila; onCancelada: () => void }) {
  const [pendiente, iniciar] = useTransition();
  const hecha = s.estado === 'completada';
  const cambiar = (estado: EstadoTarea) =>
    iniciar(async () => {
      const r = await cambiarEstadoTarea(s.id, estado);
      if (!r.error && estado === 'cancelada') onCancelada();
    });
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-borde pt-4">
      <button
        type="button"
        disabled={pendiente}
        onClick={() => cambiar(hecha ? 'pendiente' : 'completada')}
        className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3.5 text-[13px] font-semibold transition-colors disabled:opacity-60 ${
          hecha
            ? 'border-borde text-texto-suave hover:text-texto'
            : 'border-exito/40 bg-exito-suave text-exito hover:border-exito'
        }`}
      >
        <Icon name="palomita" size={15} strokeWidth={2.4} />
        {hecha ? 'Reabrir subtarea' : 'Marcar como completada'}
      </button>
      <button
        type="button"
        disabled={pendiente}
        onClick={() => cambiar('cancelada')}
        className="ml-auto min-h-10 cursor-pointer rounded-md px-3 text-[13px] font-semibold text-texto-suave hover:bg-peligro-suave hover:text-peligro disabled:opacity-60"
      >
        Cancelar subtarea
      </button>
    </div>
  );
}
