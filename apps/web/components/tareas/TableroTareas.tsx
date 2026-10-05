'use client';

import { useMemo, useState, type DragEvent } from 'react';
import { Icon } from '@/components/Icon';
import { Tarjeta } from '@/components/ui';
import { VentanaFlotante } from '@/components/VentanaFlotante';
import { descartarBorrador, guardarBorrador } from '@/lib/acciones-borradores';
import { cambiarEstadoTarea, moverTareaAEtapa } from '@/lib/acciones-tareas';
import type { BorradorTarea, TareaFila } from '@/lib/datos';
import { COLORES_ETAPA, etapaDe, etapaFinal, etapaInicial, type EtapaTarea } from '@/lib/etapas-tareas';
import { usePreferencia } from '@/lib/preferencias';
import { BotonActivarAvisos } from './BotonActivarAvisos';
import { DialogoTarea } from './DialogoTarea';
import { EditorEtapas } from './EditorEtapas';
import { useEtapas } from './EtapasContexto';
import { FormularioTarea, type OportunidadElegible } from './FormularioTarea';
import { DetallesTarea, ListaTareas } from './ListaTareas';
import { MenuTarea } from './MenuTarea';

/** Dentro de cada etapa: lo que vence antes primero; sin fecha al final. En la final: lo más reciente primero. */
const ordenar = (etapa: EtapaTarea, xs: TareaFila[]) =>
  etapa.es_final
    ? xs.sort((a, b) => (b.completada_en ?? '').localeCompare(a.completada_en ?? ''))
    : xs.sort((a, b) => (a.vence_en ?? '9999').localeCompare(b.vence_en ?? '9999'));

/**
 * «Mis tareas» como pipeline de trabajo personal (decisiones 2026-10-05). Las etapas las define cada quien («Etapas»);
 * la tarea se mueve arrastrando o con el menú del título, y la fecha abre los detalles. También se ve como lista.
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
  const etapas = useEtapas();
  const [tareas, setTareas] = useState(iniciales);
  // Cuando el servidor trae datos nuevos se adoptan sin remontar el tablero (la ventana abierta sigue abierta).
  const [previas, setPrevias] = useState(iniciales);
  if (iniciales !== previas) {
    setPrevias(iniciales);
    setTareas(iniciales);
  }
  const [vistaGuardada, guardarVista] = usePreferencia('celmi-tareas-vista');
  const vista = vistaGuardada === 'lista' ? 'lista' : 'tablero';
  const [sobre, setSobre] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; error?: boolean } | null>(null);
  const [editandoEtapas, setEditandoEtapas] = useState(false);

  const porEtapa = useMemo(() => {
    const m = new Map<string, TareaFila[]>(etapas.map((e) => [e.id, []]));
    for (const t of tareas) {
      if (t.estado === 'cancelada') continue;
      const e = etapaDe(t, etapas);
      if (e) m.get(e.id)?.push(t);
    }
    for (const e of etapas) ordenar(e, m.get(e.id)!);
    return m;
  }, [tareas, etapas]);
  const canceladas = tareas.filter((t) => t.estado === 'cancelada');

  /** Cambio optimista (se ve al instante y se revierte si la base lo rechaza). */
  const aplicar = async (
    id: string,
    cambio: Partial<TareaFila>,
    guardar: () => Promise<{ error?: string }>,
  ) => {
    const t = tareas.find((x) => x.id === id);
    if (!t) return;
    const anterior = { estado: t.estado, etapa_id: t.etapa_id, completada_en: t.completada_en };
    setTareas((xs) => xs.map((x) => (x.id === id ? { ...x, ...cambio } : x)));
    const r = await guardar();
    if (r.error) {
      setTareas((xs) => xs.map((x) => (x.id === id ? { ...x, ...anterior } : x)));
      setAviso({ texto: r.error, error: true });
    } else setAviso(null);
  };

  const moverA = (id: string, etapaId: string) => {
    const t = tareas.find((x) => x.id === id);
    const etapa = etapas.find((e) => e.id === etapaId);
    if (!t || !etapa || (t.etapa_id === etapaId && t.estado !== 'cancelada')) return;
    void aplicar(
      id,
      {
        etapa_id: etapaId,
        estado: etapa.es_final ? 'completada' : 'pendiente',
        completada_en: etapa.es_final ? new Date().toISOString() : null,
      },
      () => moverTareaAEtapa(id, etapaId),
    );
  };

  const completar = (id: string, hecha: boolean) =>
    void aplicar(
      id,
      hecha
        ? { estado: 'pendiente', etapa_id: etapaInicial(etapas)?.id ?? null, completada_en: null }
        : {
            estado: 'completada',
            etapa_id: etapaFinal(etapas)?.id ?? null,
            completada_en: new Date().toISOString(),
          },
      () => cambiarEstadoTarea(id, hecha ? 'pendiente' : 'completada'),
    );

  const cancelar = (id: string) =>
    void aplicar(id, { estado: 'cancelada' }, () => cambiarEstadoTarea(id, 'cancelada'));

  const soltar = (destino: string) => (e: DragEvent) => {
    e.preventDefault();
    setSobre(null);
    moverA(e.dataTransfer.getData('text/tarea'), destino);
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
        <button
          type="button"
          onClick={() => setEditandoEtapas(true)}
          aria-haspopup="dialog"
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-borde bg-superficie px-3.5 text-[13px] font-semibold hover:bg-superficie-2"
        >
          <Icon name="herramienta" size={16} />
          Etapas
        </button>
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

      {editandoEtapas && (
        <VentanaFlotante
          titulo="Personalizar etapas"
          detalle="Tu pipeline de tareas: sólo cambia para ti."
          esEdicion
          onCerrar={() => setEditandoEtapas(false)}
        >
          <EditorEtapas
            onListo={(ok) => {
              setEditandoEtapas(false);
              setAviso({ texto: ok });
            }}
          />
        </VentanaFlotante>
      )}

      {vista === 'lista' ? (
        <Tarjeta className="px-5 pt-3 pb-2">
          <ListaTareas tareas={tareas} mostrarOportunidad vacio="No tienes tareas abiertas." />
        </Tarjeta>
      ) : (
        <>
          <div className="-mx-1 overflow-x-auto px-1 pb-3">
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(${etapas.length}, minmax(250px, 1fr))`,
                minWidth: `${etapas.length * 262}px`,
              }}
            >
              {etapas.map((etapa) => {
                const c = COLORES_ETAPA[etapa.color];
                const lista = porEtapa.get(etapa.id) ?? [];
                return (
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
                        : `border-transparent ${c.fondo}`
                    }`}
                  >
                    <div className="mb-2.5 flex items-center gap-2 px-1.5 pt-1">
                      <span aria-hidden="true" className={`size-2.5 rounded-full ${c.punto}`} />
                      <span className={`truncate text-[13px] font-bold ${c.texto}`}>{etapa.nombre}</span>
                      {etapa.es_final && (
                        <span title="Al llegar aquí la tarea se completa" className="text-exito">
                          <Icon name="palomita" size={13} strokeWidth={2.6} />
                        </span>
                      )}
                      <span className="tabular ml-auto text-xs font-semibold text-texto-suave">
                        {lista.length}
                      </span>
                    </div>
                    <div className="flex min-h-28 flex-col gap-2">
                      {lista.map((t) => (
                        <TarjetaTarea
                          key={t.id}
                          t={t}
                          onMover={(etapaId) => moverA(t.id, etapaId)}
                          onCompletar={() => completar(t.id, t.estado === 'completada')}
                          onCancelar={() => cancelar(t.id)}
                        />
                      ))}
                      {lista.length === 0 && (
                        <p className="px-2 py-6 text-center text-xs text-texto-suave">
                          {etapa.es_final ? 'Arrastra aquí lo que termines.' : 'Arrastra tareas aquí.'}
                        </p>
                      )}
                    </div>
                  </section>
                );
              })}
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

function TarjetaTarea({
  t,
  onMover,
  onCompletar,
  onCancelar,
}: {
  t: TareaFila;
  onMover: (etapaId: string) => void;
  onCompletar: () => void;
  onCancelar: () => void;
}) {
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
          onClick={onCompletar}
          className={`mt-0.5 inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 ${
            hecha ? 'border-exito bg-exito text-white' : 'border-texto/30 hover:border-exito'
          }`}
        >
          {hecha && <Icon name="palomita" size={12} strokeWidth={3} />}
        </button>
        <MenuTarea
          titulo={t.titulo}
          estado={t.estado}
          etapaId={t.etapa_id}
          onMover={onMover}
          onCancelar={onCancelar}
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
