'use client';

import { useEffect, useId, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from 'react';
import { Icon } from '@/components/Icon';
import { useVentana } from '@/components/VentanaFlotante';
import { guardarEtapas } from '@/lib/acciones-etapas';
import { COLORES_ETAPA, etapaFinal, MAX_ETAPAS, type ColorEtapa } from '@/lib/etapas-tareas';
import { mover } from '@/lib/reordenar';
import { useEtapas } from './EtapasContexto';

interface Fila {
  /** Clave local estable (las nuevas aún no tienen id). */
  clave: string;
  id: string | null;
  nombre: string;
  color: ColorEtapa;
}

const COLORES = Object.keys(COLORES_ETAPA) as ColorEtapa[];

/**
 * Personalizar el pipeline de «Mis tareas» (decisión 2026-10-05): nombre, color y orden de las etapas abiertas; la
 * etapa final (la que cierra la tarea) se renombra y recolorea, pero no se quita y siempre va al último.
 */
export function EditorEtapas({ onListo }: { onListo: (ok: string) => void }) {
  const etapas = useEtapas();
  const final = etapaFinal(etapas);
  const ventana = useVentana();
  const id = useId();
  const [filas, setFilas] = useState<Fila[]>(() =>
    etapas
      .filter((e) => !e.es_final)
      .map((e) => ({ clave: e.id, id: e.id, nombre: e.nombre, color: e.color })),
  );
  const [fin, setFin] = useState({ nombre: final?.nombre ?? 'Completada', color: final?.color ?? 'exito' });
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const enfocar = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const lista = useRef<HTMLOListElement>(null);
  const total = filas.length + 1;

  // Tras mover con el teclado, el foco sigue a la etapa movida.
  useEffect(() => {
    if (!enfocar.current) return;
    lista.current?.querySelector<HTMLElement>(`[data-manija="${enfocar.current}"]`)?.focus();
    enfocar.current = null;
  }, [filas]);

  const cambiar = (i: number, cambio: Partial<Fila>) =>
    setFilas((xs) => xs.map((f, j) => (j === i ? { ...f, ...cambio } : f)));

  const teclas = (i: number, clave: string) => (e: KeyboardEvent) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    setFilas((xs) => mover(xs, i, i + (e.key === 'ArrowUp' ? -1 : 1)));
    enfocar.current = clave;
  };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!final) return setError('No se encontró la etapa final.');
    iniciar(async () => {
      const r = await guardarEtapas(
        filas.map(({ id: idEtapa, nombre, color }) => ({ id: idEtapa, nombre, color })),
        { id: final.id, ...fin },
      );
      if (r.error) setError(r.error);
      else onListo(r.ok ?? 'Etapas guardadas.');
    });
  };

  const control =
    'h-10 min-w-0 flex-1 rounded-md border-2 border-texto/20 bg-superficie px-3 text-sm text-texto outline-none transition-colors focus:border-acento focus:ring-4 focus:ring-acento-suave';

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      <input type="hidden" name="etapas" value={JSON.stringify([filas, fin])} />
      <p className="text-[13px] text-texto-suave">
        Arrastra con la manija (o usa ↑ ↓ sobre ella) para cambiar el orden. Al quitar una etapa, sus tareas
        pasan a la primera.
      </p>

      <ol ref={lista} className="flex flex-col gap-2" aria-label="Etapas abiertas">
        {filas.map((f, i) => (
          <li
            key={f.clave}
            onDragOver={(e) => {
              if (arrastrando === null || arrastrando === i) return;
              e.preventDefault();
              setFilas((xs) => mover(xs, arrastrando, i));
              setArrastrando(i);
            }}
            className={`flex items-center gap-2 rounded-md border bg-superficie p-2 transition-shadow ${
              arrastrando === i ? 'border-acento shadow-lg' : 'border-borde'
            }`}
          >
            <button
              type="button"
              draggable
              data-manija={f.clave}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                setArrastrando(i);
              }}
              onDragEnd={() => setArrastrando(null)}
              onKeyDown={teclas(i, f.clave)}
              aria-label={`Mover «${f.nombre || 'etapa'}» (posición ${i + 1} de ${filas.length}); usa las flechas`}
              className="inline-flex size-9 shrink-0 cursor-grab items-center justify-center rounded-md text-texto-suave hover:bg-superficie-2 active:cursor-grabbing"
            >
              <Icon name="arrastrar" size={18} strokeWidth={4} />
            </button>
            <SelectorColor valor={f.color} onCambiar={(color) => cambiar(i, { color })} />
            <label htmlFor={`${id}-${f.clave}`} className="sr-only">
              Nombre de la etapa {i + 1}
            </label>
            <input
              id={`${id}-${f.clave}`}
              value={f.nombre}
              maxLength={40}
              required
              onChange={(e) => cambiar(i, { nombre: e.target.value })}
              className={control}
            />
            <button
              type="button"
              onClick={() => setFilas((xs) => xs.filter((_, j) => j !== i))}
              disabled={filas.length <= 1}
              aria-label={`Quitar «${f.nombre || 'etapa'}»`}
              title={filas.length <= 1 ? 'Debe quedar al menos una etapa abierta' : 'Quitar etapa'}
              className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-texto-suave hover:bg-peligro-suave hover:text-peligro disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Icon name="cerrar" size={15} />
            </button>
          </li>
        ))}
      </ol>

      <button
        type="button"
        disabled={total >= MAX_ETAPAS}
        onClick={() => {
          const clave = `nueva-${Date.now()}`;
          setFilas((xs) => [
            ...xs,
            { clave, id: null, nombre: '', color: COLORES[xs.length % COLORES.length]! },
          ]);
          setTimeout(() => document.getElementById(`${id}-${clave}`)?.focus(), 0);
        }}
        className="inline-flex min-h-10 w-fit cursor-pointer items-center gap-2 rounded-md border-2 border-dashed border-texto/20 px-3.5 text-[13px] font-semibold text-acento-texto hover:border-acento disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Icon name="mas" size={16} strokeWidth={2.4} />
        {total >= MAX_ETAPAS ? `Máximo ${MAX_ETAPAS} etapas` : 'Agregar etapa'}
      </button>

      <div className="rounded-md border border-exito/30 bg-exito-suave/40 p-2">
        <div className="mb-1.5 flex items-center gap-2 px-1 text-xs font-semibold text-exito">
          <Icon name="palomita" size={13} strokeWidth={2.6} />
          Etapa final: la tarea se marca como completada al llegar aquí
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-flex size-9 shrink-0 items-center justify-center text-texto-suave"
            title="Siempre al último"
          >
            <Icon name="candado" size={15} />
          </span>
          <SelectorColor valor={fin.color} onCambiar={(color) => setFin((x) => ({ ...x, color }))} />
          <label htmlFor={`${id}-final`} className="sr-only">
            Nombre de la etapa final
          </label>
          <input
            id={`${id}-final`}
            value={fin.nombre}
            maxLength={40}
            required
            onChange={(e) => setFin((x) => ({ ...x, nombre: e.target.value }))}
            className={control}
          />
          <span className="size-9 shrink-0" />
        </div>
      </div>

      {error && <p className="text-xs text-peligro">{error}</p>}
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="submit"
          disabled={pendiente}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-acento px-4 text-sm font-semibold text-sobre-acento hover:brightness-110 disabled:opacity-60"
        >
          <Icon name="palomita" strokeWidth={2.2} />
          {pendiente ? 'Guardando…' : 'Guardar etapas'}
        </button>
        {ventana && (
          <button
            type="button"
            onClick={ventana.intentarCerrar}
            className="min-h-11 cursor-pointer rounded-md px-4 text-sm font-semibold text-texto-suave hover:bg-superficie-2"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

/** Punto de color que despliega la paleta (sólo colores del sistema de diseño). */
function SelectorColor({ valor, onCambiar }: { valor: ColorEtapa; onCambiar: (c: ColorEtapa) => void }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierta((a) => !a)}
        aria-haspopup="true"
        aria-expanded={abierta}
        aria-label={`Color: ${COLORES_ETAPA[valor].nombre}`}
        className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-superficie-2"
      >
        <span
          className={`size-4 rounded-full ring-2 ring-superficie ring-offset-1 ${COLORES_ETAPA[valor].punto}`}
        />
      </button>
      {abierta && (
        <div
          role="group"
          aria-label="Elegir color"
          className="animar-entrada absolute top-full left-0 z-20 mt-1 flex gap-1 rounded-md border border-borde bg-superficie p-1.5 shadow-lg"
          onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setAbierta(false))}
        >
          {COLORES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={c === valor}
              aria-label={COLORES_ETAPA[c].nombre}
              title={COLORES_ETAPA[c].nombre}
              onClick={() => {
                onCambiar(c);
                setAbierta(false);
              }}
              className={`inline-flex size-8 cursor-pointer items-center justify-center rounded-sm hover:bg-superficie-2 ${
                c === valor ? 'bg-superficie-2' : ''
              }`}
            >
              <span className={`size-4 rounded-full ${COLORES_ETAPA[c].punto}`} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
