'use client';

import { useMemo, useState, type DragEvent } from 'react';
import { Icon } from '@/components/Icon';
import { Tarjeta } from '@/components/ui';
import { cambiarEstadoTarea } from '@/lib/acciones-tareas';
import type { TareaFila } from '@/lib/datos';
import { usePreferencia } from '@/lib/preferencias';
import { BotonActivarAvisos } from './BotonActivarAvisos';
import { DialogoTarea } from './DialogoTarea';
import { DetallesTarea, ListaTareas, useAccionesTarea } from './ListaTareas';

type Columna = 'vencidas' | 'hoy' | 'proximas' | 'completadas';

const COLUMNAS: { id: Columna; titulo: string; tono: string; vacio: string }[] = [
  { id: 'vencidas', titulo: 'Vencidas', tono: 'text-peligro', vacio: 'Nada vencido.' },
  { id: 'hoy', titulo: 'Hoy', tono: 'text-aviso', vacio: 'Nada para hoy.' },
  { id: 'proximas', titulo: 'Próximas', tono: 'text-acento-texto', vacio: 'Sin tareas próximas.' },
  { id: 'completadas', titulo: 'Completadas', tono: 'text-exito', vacio: 'Arrastra aquí lo que termines.' },
];

function columnaDe(t: TareaFila): Columna | null {
  if (t.estado === 'completada') return 'completadas';
  if (t.estado === 'cancelada') return null;
  const vence = new Date(t.vence_en);
  if (vence.getTime() < Date.now()) return 'vencidas';
  return vence.toDateString() === new Date().toDateString() ? 'hoy' : 'proximas';
}

/** «Mis tareas» como tablero (pendientes vs. completadas) o como lista; la vista se recuerda. */
export function TableroTareas({ tareas: iniciales }: { tareas: TareaFila[] }) {
  const [tareas, setTareas] = useState(iniciales);
  const [vistaGuardada, guardarVista] = usePreferencia('celmi-tareas-vista');
  const vista = vistaGuardada === 'lista' ? 'lista' : 'tablero';
  const [sobre, setSobre] = useState<Columna | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const porColumna = useMemo(() => {
    const m: Record<Columna, TareaFila[]> = { vencidas: [], hoy: [], proximas: [], completadas: [] };
    for (const t of tareas) {
      const c = columnaDe(t);
      if (c) m[c].push(t);
    }
    m.completadas.sort((a, b) => (b.completada_en ?? '').localeCompare(a.completada_en ?? ''));
    return m;
  }, [tareas]);
  const canceladas = tareas.filter((t) => t.estado === 'cancelada');

  const soltar = (destino: Columna) => async (e: DragEvent) => {
    e.preventDefault();
    setSobre(null);
    const t = tareas.find((x) => x.id === e.dataTransfer.getData('text/tarea'));
    if (!t || columnaDe(t) === destino) return;
    const estado = destino === 'completadas' ? 'completada' : 'pendiente';
    if (t.estado === estado) {
      setAviso('Para cambiar la fecha de una tarea, ábrela con el lápiz y reprográmala.');
      return;
    }
    setAviso(null);
    const anterior = t.estado;
    setTareas((xs) =>
      xs.map((x) =>
        x.id === t.id
          ? { ...x, estado, completada_en: estado === 'completada' ? new Date().toISOString() : null }
          : x,
      ),
    );
    const r = await cambiarEstadoTarea(t.id, estado);
    if (r.error) {
      setTareas((xs) => xs.map((x) => (x.id === t.id ? { ...x, estado: anterior } : x)));
      setAviso(r.error);
    }
  };

  return (
    <div className="animar-entrada mx-auto max-w-[1440px]">
      <header className="mb-5 flex flex-wrap items-end gap-4">
        <div className="mr-auto">
          <h1 className="text-[28px] leading-tight font-bold tracking-tight">Mis tareas</h1>
          <p className="mt-1.5 text-sm text-texto-suave">
            Son personales: sólo tú las ves. Se crean desde la ficha de cada oportunidad.
          </p>
        </div>
        <BotonActivarAvisos />
        <div
          role="group"
          aria-label="Vista"
          className="inline-flex rounded-md border border-borde bg-superficie p-1"
        >
          {(['tablero', 'lista'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={vista === v}
              onClick={() => guardarVista(v === 'tablero' ? null : v)}
              className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-sm px-3 text-[13px] font-semibold transition-colors ${
                vista === v ? 'bg-paso text-white' : 'text-texto-suave hover:text-texto'
              }`}
            >
              <Icon name={v === 'tablero' ? 'columnas' : 'cotizaciones'} size={16} />
              {v === 'tablero' ? 'Tablero' : 'Lista'}
            </button>
          ))}
        </div>
      </header>

      {aviso && (
        <p role="status" className="mb-4 rounded-md bg-info-suave px-4 py-3 text-[13px] text-info">
          {aviso}
        </p>
      )}

      {vista === 'lista' ? (
        <Tarjeta className="px-5 pt-3 pb-2">
          <ListaTareas
            tareas={[...tareas].sort((a, b) => a.vence_en.localeCompare(b.vence_en))}
            mostrarOportunidad
          />
        </Tarjeta>
      ) : (
        <>
          <div className="-mx-1 overflow-x-auto px-1 pb-3">
            <div className="grid min-w-[1000px] grid-cols-4 gap-3">
              {COLUMNAS.map((col) => (
                <section
                  key={col.id}
                  aria-label={col.titulo}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setSobre(col.id);
                  }}
                  onDragLeave={() => setSobre((s) => (s === col.id ? null : s))}
                  onDrop={soltar(col.id)}
                  className={`flex flex-col rounded-lg border p-2.5 transition-colors ${
                    sobre === col.id
                      ? 'border-acento bg-acento-suave/60'
                      : col.id === 'completadas'
                        ? 'border-transparent bg-exito-suave/50'
                        : 'border-transparent bg-superficie-2'
                  }`}
                >
                  <div className="mb-2.5 flex items-center justify-between px-1.5 pt-1">
                    <span className={`text-[13px] font-bold ${col.tono}`}>{col.titulo}</span>
                    <span className="tabular text-xs font-semibold text-texto-suave">
                      {porColumna[col.id].length}
                    </span>
                  </div>
                  <div className="flex min-h-28 flex-col gap-2">
                    {porColumna[col.id].map((t) => (
                      <TarjetaTarea key={t.id} t={t} />
                    ))}
                    {porColumna[col.id].length === 0 && (
                      <p className="px-2 py-6 text-center text-xs text-texto-suave">{col.vacio}</p>
                    )}
                  </div>
                </section>
              ))}
            </div>
          </div>
          <p className="mt-1 text-xs text-texto-suave">
            Arrastra una tarjeta a «Completadas» para terminarla, o de regreso para reabrirla. Para cambiar la
            fecha, usa el lápiz de la tarjeta.
          </p>
          {canceladas.length > 0 && (
            <Tarjeta className="mt-5 px-5 pt-3 pb-2">
              <ListaTareas tareas={canceladas} mostrarOportunidad vacio="" />
            </Tarjeta>
          )}
        </>
      )}
    </div>
  );
}

function TarjetaTarea({ t }: { t: TareaFila }) {
  const { pendiente, error, cambiar } = useAccionesTarea(t);
  const [editando, setEditando] = useState(false);
  const hecha = t.estado === 'completada';
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/tarea', t.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className={`group cursor-grab rounded-md border border-borde bg-superficie p-3.5 sombra transition-[border-color] hover:border-acento/50 active:cursor-grabbing ${
        pendiente ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          role="checkbox"
          aria-checked={hecha}
          aria-label={hecha ? `Reabrir «${t.titulo}»` : `Marcar «${t.titulo}» como completada`}
          onClick={() => cambiar(hecha ? 'pendiente' : 'completada')}
          className={`mt-0.5 inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 ${
            hecha ? 'border-exito bg-exito text-white' : 'border-texto/30 hover:border-exito'
          }`}
        >
          {hecha && <Icon name="palomita" size={12} strokeWidth={3} />}
        </button>
        <div
          className={`min-w-0 flex-1 text-sm leading-snug font-semibold ${hecha ? 'text-texto-suave line-through' : ''}`}
        >
          {t.titulo}
        </div>
        <button
          type="button"
          onClick={() => setEditando(true)}
          aria-label={`Editar o reprogramar «${t.titulo}»`}
          title="Editar o reprogramar"
          className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-texto-suave hover:bg-superficie-2 hover:text-texto"
        >
          <Icon name="herramienta" size={15} />
        </button>
      </div>
      <div className="pl-7">
        <DetallesTarea t={t} mostrarOportunidad />
        {error && <p className="mt-1 text-xs text-peligro">{error}</p>}
      </div>
      {editando && <DialogoTarea tarea={t} onCerrar={() => setEditando(false)} />}
    </article>
  );
}
