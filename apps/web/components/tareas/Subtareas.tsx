'use client';

import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from 'react';
import { Icon } from '@/components/Icon';
import { Boton } from '@/components/ui';
import { VentanaFlotante } from '@/components/VentanaFlotante';
import {
  cambiarEstadoTarea,
  crearSubtarea,
  reordenarSubtareas,
  reprogramarTarea,
} from '@/lib/acciones-tareas';
import type { SubtareaFila, TareaFila } from '@/lib/datos';
import type { EstadoTarea } from '@/lib/etapas-tareas';
import { mover } from '@/lib/reordenar';
import { FormularioTarea } from './FormularioTarea';
import { subtareasVigentes } from './AvanceSubtareas';
import { alClicLibre } from './clicLibre';
import { cuando, TONOS_CUANDO } from './cuando';
import { SelectorFecha } from './SelectorFecha';

/**
 * Lista de subtareas de una tarea existente: agregado rápido, detalle de cada una y reordenamiento (arrastrando la
 * manija o con ↑ ↓ sobre ella; decisión 2026-10-05).
 */
export function Subtareas({ tarea }: { tarea: TareaFila }) {
  const desdeServidor = subtareasVigentes(tarea);
  // Orden local para que el cambio se vea al instante; se adopta el del servidor cuando llega uno nuevo.
  const [vigentes, setVigentes] = useState(desdeServidor);
  const [previas, setPrevias] = useState(tarea.subtareas);
  if (tarea.subtareas !== previas) {
    setPrevias(tarea.subtareas);
    setVigentes(desdeServidor);
  }
  const hechas = vigentes.filter((s) => s.estado === 'completada').length;
  const [abierta, setAbierta] = useState<string | null>(null);
  const subAbierta = vigentes.find((s) => s.id === abierta);
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lista = useRef<HTMLUListElement>(null);
  const enfocar = useRef<string | null>(null);

  useEffect(() => {
    if (!enfocar.current) return;
    lista.current?.querySelector<HTMLElement>(`[data-manija="${enfocar.current}"]`)?.focus();
    enfocar.current = null;
  }, [vigentes]);

  const guardarOrden = async (orden: typeof vigentes) => {
    const r = await reordenarSubtareas(
      tarea.id,
      orden.map((x) => x.id),
    );
    setError(r.error ?? null);
  };

  const teclas = (i: number, id: string) => (e: KeyboardEvent) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const nuevo = mover(vigentes, i, i + (e.key === 'ArrowUp' ? -1 : 1));
    enfocar.current = id;
    setVigentes(nuevo);
    void guardarOrden(nuevo);
  };

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
        <ul ref={lista} className="flex flex-col">
          {vigentes.map((s, i) => (
            <FilaSubtarea
              key={s.id}
              s={s}
              onAbrir={() => setAbierta(s.id)}
              arrastrada={arrastrando === i}
              manija={{
                posicion: i + 1,
                total: vigentes.length,
                onKeyDown: teclas(i, s.id),
                onDragStart: () => setArrastrando(i),
                onDragEnd: () => {
                  setArrastrando(null);
                  void guardarOrden(vigentes);
                },
              }}
              onDragOver={() => {
                if (arrastrando === null || arrastrando === i) return false;
                setVigentes((xs) => mover(xs, arrastrando, i));
                setArrastrando(i);
                return true;
              }}
            />
          ))}
        </ul>
      )}
      {error && <p className="mt-1 text-xs text-peligro">{error}</p>}
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

function FilaSubtarea({
  s,
  onAbrir,
  arrastrada,
  manija,
  onDragOver,
}: {
  s: SubtareaFila;
  onAbrir: () => void;
  arrastrada: boolean;
  manija: {
    posicion: number;
    total: number;
    onKeyDown: (e: KeyboardEvent) => void;
    onDragStart: () => void;
    onDragEnd: () => void;
  };
  /** Devuelve si la fila acepta lo que se arrastra (para permitir soltar). */
  onDragOver: () => boolean;
}) {
  const [pendiente, iniciar] = useTransition();
  const hecha = s.estado === 'completada';
  const c = s.vence_en ? cuando(s.vence_en, s.sin_hora) : null;
  return (
    <li
      onClick={alClicLibre(onAbrir)}
      onDragOver={(e) => {
        if (onDragOver()) e.preventDefault();
      }}
      className={`group flex min-h-11 items-center gap-1.5 border-b border-borde/70 pr-1 transition-shadow last:border-0 ${
        pendiente ? 'opacity-60' : ''
      } ${arrastrada ? 'relative z-10 rounded-md border-transparent bg-superficie shadow-lg ring-2 ring-acento' : ''}`}
    >
      <button
        type="button"
        draggable
        data-manija={s.id}
        onDragStart={(e) => {
          e.stopPropagation(); // no es la tarjeta del tablero la que se arrastra
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', s.id);
          manija.onDragStart();
        }}
        onDragEnd={manija.onDragEnd}
        onKeyDown={manija.onKeyDown}
        aria-label={`Mover «${s.titulo}» (posición ${manija.posicion} de ${manija.total}); usa las flechas`}
        title="Arrastra para reordenar"
        className="inline-flex size-8 shrink-0 cursor-grab items-center justify-center rounded-md text-texto-suave opacity-40 group-hover:opacity-100 hover:bg-superficie-2 focus-visible:opacity-100 active:cursor-grabbing"
      >
        <Icon name="arrastrar" size={17} strokeWidth={4} />
      </button>
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
      {!hecha && (
        <SelectorFecha
          venceEn={s.vence_en}
          sinHora={s.sin_hora}
          onCambiar={(venceEn, sinHora) =>
            iniciar(async () => void (await reprogramarTarea(s.id, venceEn, sinHora)))
          }
          className={`inline-flex min-h-7 shrink-0 cursor-pointer items-center gap-1 rounded-pill px-2 text-xs font-semibold transition-[box-shadow,opacity] hover:ring-2 hover:ring-acento/40 ${
            c
              ? TONOS_CUANDO[c.tono]
              : `${TONOS_CUANDO.vacio} pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 focus-visible:opacity-100`
          }`}
        >
          <Icon name="reloj" size={12} />
          {c ? c.texto : 'Fecha'}
        </SelectorFecha>
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
          <Boton type="submit" variante="primario" tamano="chico" disabled={pendiente}>
            {pendiente ? 'Agregando…' : 'Agregar'}
          </Boton>
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
      <Boton
        variante={hecha ? 'secundario' : 'exito'}
        tamano="chico"
        icono="palomita"
        disabled={pendiente}
        onClick={() => cambiar(hecha ? 'pendiente' : 'completada')}
      >
        {hecha ? 'Reabrir subtarea' : 'Marcar como completada'}
      </Boton>
      <Boton
        variante="peligro"
        tamano="chico"
        disabled={pendiente}
        onClick={() => cambiar('cancelada')}
        className="ml-auto"
      >
        Cancelar subtarea
      </Boton>
    </div>
  );
}
