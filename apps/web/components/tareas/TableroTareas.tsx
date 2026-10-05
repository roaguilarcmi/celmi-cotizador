'use client';

import { useMemo, useState, type DragEvent } from 'react';
import { Icon } from '@/components/Icon';
import { Tarjeta } from '@/components/ui';
import { VentanaFlotante } from '@/components/VentanaFlotante';
import { descartarBorrador, guardarBorrador } from '@/lib/acciones-borradores';
import { cambiarEstadoTarea } from '@/lib/acciones-tareas';
import type { BorradorTarea, TareaFila } from '@/lib/datos';
import { ETAPAS, type EstadoTarea } from '@/lib/etapas-tareas';
import { usePreferencia } from '@/lib/preferencias';
import { BotonActivarAvisos } from './BotonActivarAvisos';
import { DialogoTarea } from './DialogoTarea';
import { FormularioTarea, type OportunidadElegible } from './FormularioTarea';
import { DetallesTarea, ListaTareas } from './ListaTareas';
import { MenuTarea } from './MenuTarea';

type Etapa = (typeof ETAPAS)[number]['id'];

const VACIO: Record<Etapa, string> = {
  pendiente: 'Nada por hacer. Crea una con «Nueva tarea».',
  en_curso: 'Arrastra aquí lo que estés trabajando.',
  en_espera: 'Lo que depende de alguien más.',
  completada: 'Arrastra aquí lo que termines.',
};

/** Dentro de cada etapa: lo que vence antes primero; sin fecha al final. Completadas: lo más reciente primero. */
const ordenar = (etapa: Etapa, xs: TareaFila[]) =>
  etapa === 'completada'
    ? xs.sort((a, b) => (b.completada_en ?? '').localeCompare(a.completada_en ?? ''))
    : xs.sort((a, b) => (a.vence_en ?? '9999').localeCompare(b.vence_en ?? '9999'));

/**
 * «Mis tareas» como pipeline de trabajo (decisión 2026-10-05): Por hacer → En curso → En espera → Completada. Se mueve
 * arrastrando o con el menú del título; la fecha abre los detalles. También se ve como lista.
 */
export function TableroTareas({
  tareas: iniciales,
  oportunidades,
  borrador,
}: {
  tareas: TareaFila[];
  oportunidades: OportunidadElegible[];
  borrador?: BorradorTarea;
}) {
  const [tareas, setTareas] = useState(iniciales);
  // Cuando el servidor trae datos nuevos se adoptan sin remontar el tablero (la ventana abierta sigue abierta).
  const [previas, setPrevias] = useState(iniciales);
  if (iniciales !== previas) {
    setPrevias(iniciales);
    setTareas(iniciales);
  }
  const [vistaGuardada, guardarVista] = usePreferencia('celmi-tareas-vista');
  const vista = vistaGuardada === 'lista' ? 'lista' : 'tablero';
  const [sobre, setSobre] = useState<Etapa | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; error?: boolean } | null>(null);

  const porEtapa = useMemo(() => {
    const m: Record<Etapa, TareaFila[]> = { pendiente: [], en_curso: [], en_espera: [], completada: [] };
    for (const t of tareas) if (t.estado !== 'cancelada') m[t.estado].push(t);
    for (const e of ETAPAS) ordenar(e.id, m[e.id]);
    return m;
  }, [tareas]);
  const canceladas = tareas.filter((t) => t.estado === 'cancelada');

  /** Cambio optimista: se ve al instante y se revierte si la base lo rechaza. */
  const mover = async (id: string, estado: EstadoTarea) => {
    const t = tareas.find((x) => x.id === id);
    if (!t || t.estado === estado) return;
    const anterior = { estado: t.estado, completada_en: t.completada_en };
    setTareas((xs) =>
      xs.map((x) =>
        x.id === id
          ? { ...x, estado, completada_en: estado === 'completada' ? new Date().toISOString() : null }
          : x,
      ),
    );
    const r = await cambiarEstadoTarea(id, estado);
    if (r.error) {
      setTareas((xs) => xs.map((x) => (x.id === id ? { ...x, ...anterior } : x)));
      setAviso({ texto: r.error, error: true });
    } else setAviso(null);
  };

  const soltar = (destino: Etapa) => (e: DragEvent) => {
    e.preventDefault();
    setSobre(null);
    void mover(e.dataTransfer.getData('text/tarea'), destino);
  };

  return (
    <div className="animar-entrada mx-auto max-w-[1440px]">
      <header className="mb-5 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-[28px] leading-tight font-bold tracking-tight">Mis tareas</h1>
          <p className="mt-1.5 text-sm text-texto-suave">
            Son personales: sólo tú las ves. Clic en el título para moverla de etapa; en la fecha, para ver el
            detalle.
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
        <NuevaTarea
          oportunidades={oportunidades}
          borrador={borrador}
          onAviso={(texto) => setAviso({ texto })}
        />
      </header>

      {aviso && (
        <p
          role="status"
          className={`mb-4 flex items-center gap-2 rounded-md px-4 py-2.5 text-[13px] font-semibold ${
            aviso.error ? 'bg-peligro-suave text-peligro' : 'bg-exito-suave text-exito'
          }`}
        >
          <Icon name={aviso.error ? 'cerrar' : 'palomita'} size={15} strokeWidth={2.4} />
          <span className="mr-auto">{aviso.texto}</span>
          <button
            type="button"
            onClick={() => setAviso(null)}
            aria-label="Ocultar mensaje"
            className="inline-flex size-7 cursor-pointer items-center justify-center rounded-sm hover:bg-superficie/60"
          >
            <Icon name="cerrar" size={13} />
          </button>
        </p>
      )}

      {vista === 'lista' ? (
        <Tarjeta className="px-5 pt-3 pb-2">
          <ListaTareas tareas={tareas} mostrarOportunidad vacio="No tienes tareas abiertas." />
        </Tarjeta>
      ) : (
        <>
          <div className="-mx-1 overflow-x-auto px-1 pb-3">
            <div className="grid min-w-[1040px] grid-cols-4 gap-3">
              {ETAPAS.map((etapa) => (
                <section
                  key={etapa.id}
                  aria-label={etapa.nombre}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setSobre(etapa.id);
                  }}
                  onDragLeave={() => setSobre((s) => (s === etapa.id ? null : s))}
                  onDrop={soltar(etapa.id)}
                  className={`flex flex-col rounded-lg border p-2.5 transition-colors ${
                    sobre === etapa.id
                      ? 'border-acento bg-acento-suave/70'
                      : `border-transparent ${etapa.fondo}`
                  }`}
                >
                  <div className="mb-2.5 flex items-center gap-2 px-1.5 pt-1">
                    <span aria-hidden="true" className={`size-2.5 rounded-full ${etapa.punto}`} />
                    <span className={`text-[13px] font-bold ${etapa.texto}`}>{etapa.nombre}</span>
                    <span className="tabular ml-auto text-xs font-semibold text-texto-suave">
                      {porEtapa[etapa.id].length}
                    </span>
                  </div>
                  <div className="flex min-h-28 flex-col gap-2">
                    {porEtapa[etapa.id].map((t) => (
                      <TarjetaTarea key={t.id} t={t} onMover={(estado) => void mover(t.id, estado)} />
                    ))}
                    {porEtapa[etapa.id].length === 0 && (
                      <p className="px-2 py-6 text-center text-xs text-texto-suave">{VACIO[etapa.id]}</p>
                    )}
                  </div>
                </section>
              ))}
            </div>
          </div>
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

function TarjetaTarea({ t, onMover }: { t: TareaFila; onMover: (estado: EstadoTarea) => void }) {
  const [abierta, setAbierta] = useState(false);
  const hecha = t.estado === 'completada';
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/tarea', t.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className="cursor-grab rounded-md border border-borde bg-superficie p-3.5 sombra transition-[border-color] hover:border-acento/50 active:cursor-grabbing"
    >
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          role="checkbox"
          aria-checked={hecha}
          aria-label={hecha ? `Reabrir «${t.titulo}»` : `Marcar «${t.titulo}» como completada`}
          onClick={() => onMover(hecha ? 'pendiente' : 'completada')}
          className={`mt-0.5 inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 ${
            hecha ? 'border-exito bg-exito text-white' : 'border-texto/30 hover:border-exito'
          }`}
        >
          {hecha && <Icon name="palomita" size={12} strokeWidth={3} />}
        </button>
        <MenuTarea
          titulo={t.titulo}
          estado={t.estado}
          onMover={onMover}
          onAbrir={() => setAbierta(true)}
          className={`text-sm leading-snug font-semibold ${hecha ? 'text-texto-suave line-through' : ''}`}
        />
      </div>
      <div className="pl-7">
        <DetallesTarea t={t} mostrarOportunidad compacta onAbrir={() => setAbierta(true)} />
      </div>
      {abierta && <DialogoTarea tarea={t} onCerrar={() => setAbierta(false)} />}
    </article>
  );
}

/** «Nueva tarea» desde «Mis tareas»: ligada a una oportunidad (opcional), con borrador propio. */
function NuevaTarea({
  oportunidades,
  borrador,
  onAviso,
}: {
  oportunidades: OportunidadElegible[];
  borrador?: BorradorTarea;
  onAviso: (texto: string) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const [usarBorrador, setUsarBorrador] = useState(true);
  const [version, setVersion] = useState(0);
  const conBorrador = usarBorrador ? borrador : undefined;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setUsarBorrador(true);
          setAbierta(true);
        }}
        aria-haspopup="dialog"
        className="relative inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-acento px-4 text-sm font-semibold text-sobre-acento hover:brightness-110"
      >
        <Icon name={borrador ? 'guardado' : 'mas'} size={17} strokeWidth={2.2} />
        {borrador ? 'Continuar borrador' : 'Nueva tarea'}
        {borrador && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 size-3 rounded-full border-2 border-superficie bg-aviso"
          />
        )}
      </button>
      {abierta && (
        <VentanaFlotante
          titulo="Nueva tarea"
          detalle="Personal: sólo tú la verás. Puedes ligarla a una oportunidad y ponerle fecha, o dejarla libre."
          version={version}
          onCerrar={() => setAbierta(false)}
          onBorrador={async (datos) => {
            const r = await guardarBorrador(null, 'tarea', datos);
            if (r.ok) onAviso(r.ok);
            return r;
          }}
        >
          {conBorrador && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-aviso/30 bg-aviso-suave px-3.5 py-2 text-[13px] text-aviso">
              <Icon name="guardado" size={16} />
              <span className="mr-auto">Continúas un borrador guardado.</span>
              <button
                type="button"
                onClick={() => {
                  setUsarBorrador(false);
                  setVersion((v) => v + 1);
                  void descartarBorrador(null, 'tarea');
                }}
                className="min-h-8 cursor-pointer font-semibold underline-offset-2 hover:underline"
              >
                Empezar de cero
              </button>
            </div>
          )}
          <FormularioTarea
            key={version}
            oportunidades={oportunidades}
            borrador={conBorrador}
            onListo={(ok) => {
              setAbierta(false);
              onAviso(ok);
            }}
          />
        </VentanaFlotante>
      )}
    </>
  );
}
