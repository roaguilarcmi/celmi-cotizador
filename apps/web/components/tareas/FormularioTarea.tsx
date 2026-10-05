'use client';

import type { JSONContent } from '@tiptap/core';
import { useId, useState, useTransition, type FormEvent } from 'react';
import { EditorEnriquecido } from '@/components/EditorEnriquecido';
import { Icon } from '@/components/Icon';
import { useVentana } from '@/components/VentanaFlotante';
import { actualizarSubtarea, actualizarTarea, crearTarea } from '@/lib/acciones-tareas';
import type { BorradorTarea } from '@/lib/datos';
import { BotonActivarAvisos } from './BotonActivarAvisos';
import { SubtareasNuevas } from './SubtareasNuevas';

/** Anticipaciones disponibles (se pueden elegir varias). */
export const OPCIONES_AVISO = [
  { minutos: 0, nombre: 'A la hora' },
  { minutos: 15, nombre: '15 min antes' },
  { minutos: 30, nombre: '30 min antes' },
  { minutos: 60, nombre: '1 h antes' },
  { minutos: 1440, nombre: '1 día antes' },
  { minutos: 2880, nombre: '2 días antes' },
];

export const nombreAviso = (m: number) =>
  OPCIONES_AVISO.find((o) => o.minutos === m)?.nombre ??
  (m % 1440 === 0 ? `${m / 1440} días antes` : m % 60 === 0 ? `${m / 60} h antes` : `${m} min antes`);

const dos = (n: number) => String(n).padStart(2, '0');
const local = (d: Date) => ({
  fecha: `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`,
  hora: `${dos(d.getHours())}:${dos(d.getMinutes())}`,
});

/** Mañana a las 10:00 (hora local) para tareas nuevas. */
function porOmision() {
  const d = new Date(Date.now() + 86_400_000);
  d.setHours(10, 0, 0, 0);
  return local(d);
}

/** Lo que se edita de una tarea o subtarea. */
export interface TareaEditable {
  id: string;
  titulo: string;
  notas: unknown;
  vence_en: string | null;
  sin_hora?: boolean;
  avisos: { minutos_antes: number }[];
}

/** Oportunidad que se puede ligar al crear una tarea desde «Mis tareas». */
export interface OportunidadElegible {
  id: string;
  nombre: string;
  cliente: string;
}

/** Sin hora sólo caben avisos con días de anticipación. */
const avisoDeDias = (m: number) => m % 1440 === 0;

/**
 * Crear (desde una oportunidad con `oportunidadId`, o desde «Mis tareas» con `oportunidades` para elegir una o
 * ninguna), editar/reprogramar (con `tarea`) o editar una subtarea (`esSubtarea`). La fecha es opcional y, con
 * fecha, la hora también (decisión 2026-10-05).
 */
export function FormularioTarea({
  oportunidadId,
  tarea,
  oportunidades,
  esSubtarea = false,
  borrador,
  onListo,
}: {
  oportunidadId?: string;
  oportunidades?: OportunidadElegible[];
  tarea?: TareaEditable;
  esSubtarea?: boolean;
  /** Valores de un borrador guardado para continuarlo. */
  borrador?: BorradorTarea;
  /** Al guardar con éxito (con el mensaje); si no se pasa, el formulario se vacía para capturar otra. */
  onListo?: (ok: string) => void;
}) {
  const ventana = useVentana();
  const id = useId();
  const [version, setVersion] = useState(0);
  const [avisos, setAvisos] = useState<number[]>(
    () => tarea?.avisos.map((a) => a.minutos_antes) ?? borrador?.avisos ?? (esSubtarea ? [] : [15]),
  );
  const [conFecha, setConFecha] = useState(() =>
    tarea ? Boolean(tarea.vence_en) : (borrador?.con_fecha ?? true),
  );
  const [sinHora, setSinHora] = useState(
    () => tarea?.sin_hora ?? (Boolean(borrador?.fecha) && borrador?.hora === ''),
  );
  const [{ fecha, hora }, setCuando] = useState(() =>
    tarea?.vence_en
      ? local(new Date(tarea.vence_en))
      : borrador?.fecha && borrador.hora
        ? { fecha: borrador.fecha, hora: borrador.hora }
        : porOmision(),
  );
  const [mensaje, setMensaje] = useState<{ error?: string; ok?: string }>({});
  const [pendiente, iniciar] = useTransition();
  const sujeto = esSubtarea ? 'subtarea' : 'tarea';

  const alternar = (m: number) =>
    setAvisos((xs) => (xs.includes(m) ? xs.filter((x) => x !== m) : [...xs, m].sort((a, b) => a - b)));

  const enviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    if (conFecha) {
      // Sin hora, vence al final de ese día.
      const vence = new Date(`${fecha}T${sinHora ? '23:59' : hora}`);
      if (Number.isNaN(vence.getTime()))
        return setMensaje({ error: sinHora ? 'Elige la fecha.' : 'Elige la fecha y hora.' });
      // El navegador conoce la zona horaria de quien captura: se envía el instante exacto en ISO.
      datos.set('vence_en', vence.toISOString());
      datos.set('avisos', JSON.stringify(sinHora ? avisos.filter(avisoDeDias) : avisos));
    } else {
      datos.set('vence_en', '');
      datos.set('avisos', '[]');
    }
    iniciar(async () => {
      const r = !tarea
        ? await crearTarea(oportunidadId ?? null, {}, datos)
        : esSubtarea
          ? await actualizarSubtarea(tarea.id, {}, datos)
          : await actualizarTarea(tarea.id, {}, datos);
      setMensaje(r);
      if (r.ok) {
        if (onListo) onListo(r.ok);
        else {
          setVersion((v) => v + 1); // reinicia título y notas
          setCuando(porOmision());
        }
      }
    });
  };

  const control =
    'h-11 rounded-md border-2 border-texto/20 bg-superficie px-3 text-sm text-texto outline-none transition-colors focus:border-acento focus:ring-4 focus:ring-acento-suave';

  return (
    <form key={version} onSubmit={enviar} className="flex flex-col gap-3.5">
      <input type="hidden" name="avisos" value={conFecha ? JSON.stringify(avisos) : '[]'} />
      <input type="hidden" name="con_fecha" value={conFecha ? 'si' : 'no'} />
      <input type="hidden" name="sin_hora" value={conFecha && sinHora ? 'si' : 'no'} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-titulo`} className="text-xs font-semibold text-texto-suave">
          ¿Qué hay que hacer?
        </label>
        <input
          id={`${id}-titulo`}
          name="titulo"
          required
          minLength={2}
          maxLength={200}
          autoComplete="off"
          defaultValue={tarea?.titulo ?? borrador?.titulo}
          placeholder={
            esSubtarea ? 'Ej. «Pedir precio a CVA»' : 'Ej. «Llamar a Héctor para confirmar la vigencia»'
          }
          className={`${control} w-full`}
        />
      </div>

      {oportunidades && !tarea && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-oportunidad`} className="text-xs font-semibold text-texto-suave">
            Oportunidad <span className="font-normal">(opcional)</span>
          </label>
          <select
            id={`${id}-oportunidad`}
            name="oportunidad_id"
            defaultValue={borrador?.oportunidad ?? ''}
            className={`${control} w-full`}
          >
            <option value="">Sin oportunidad · tarea libre</option>
            {oportunidades.map((o) => (
              <option key={o.id} value={o.id}>
                {o.cliente ? `${o.cliente} · ${o.nombre}` : o.nombre}
              </option>
            ))}
          </select>
        </div>
      )}

      <div
        role="radiogroup"
        aria-label="¿Tiene fecha?"
        className="inline-flex w-fit rounded-md border border-borde bg-superficie-2 p-1"
      >
        {[
          { valor: true, nombre: 'Con fecha', icono: 'reloj' as const },
          { valor: false, nombre: 'Sin fecha', icono: 'cerrar' as const },
        ].map((o) => (
          <button
            key={o.nombre}
            type="button"
            role="radio"
            aria-checked={conFecha === o.valor}
            onClick={() => setConFecha(o.valor)}
            className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-sm px-3.5 text-[13px] font-semibold transition-colors ${
              conFecha === o.valor ? 'bg-superficie text-texto sombra' : 'text-texto-suave hover:text-texto'
            }`}
          >
            <Icon name={o.icono} size={14} />
            {o.nombre}
          </button>
        ))}
      </div>

      {conFecha && (
        <>
          <div className="flex flex-wrap items-end gap-2.5">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-texto-suave">
              Fecha
              <input
                type="date"
                name="fecha"
                value={fecha}
                onChange={(e) => setCuando((c) => ({ ...c, fecha: e.target.value }))}
                required
                className={control}
              />
            </label>
            {!sinHora && (
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-texto-suave">
                Hora
                <input
                  type="time"
                  name="hora"
                  value={hora}
                  onChange={(e) => setCuando((c) => ({ ...c, hora: e.target.value }))}
                  required
                  className={control}
                />
              </label>
            )}
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-[13px] font-semibold">
              <input
                type="checkbox"
                checked={sinHora}
                onChange={(e) => setSinHora(e.target.checked)}
                className="size-4 accent-acento"
              />
              Sin hora (cualquier momento del día)
            </label>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold text-texto-suave">
              Avisos{' '}
              <span className="font-normal">
                {sinHora
                  ? '(sin hora, sólo con días de anticipación)'
                  : '(elige uno o varios; ninguno = sin aviso)'}
              </span>
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {OPCIONES_AVISO.filter((o) => !sinHora || avisoDeDias(o.minutos)).map((o) => {
                const activo = avisos.includes(o.minutos);
                return (
                  <button
                    key={o.minutos}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => alternar(o.minutos)}
                    className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-pill border px-3 text-[13px] font-semibold transition-colors ${
                      activo
                        ? 'border-paso bg-paso text-white'
                        : 'border-borde bg-superficie text-texto-suave hover:text-texto'
                    }`}
                  >
                    <Icon name={activo ? 'palomita' : 'campana'} size={14} strokeWidth={activo ? 2.6 : 1.8} />
                    {o.nombre}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-texto-suave">Notas</span>
        <EditorEnriquecido
          nombre="notas"
          inicial={((tarea?.notas ?? borrador?.notas) as JSONContent | null) ?? null}
          etiqueta={`Notas de la ${sujeto}`}
          placeholder="Detalles, datos de contacto, qué preguntar… (opcional)"
          minAlto={72}
        />
      </div>

      {!tarea && <SubtareasNuevas inicial={borrador?.subtareas} />}

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="submit"
          disabled={pendiente}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-acento px-4 text-sm font-semibold text-sobre-acento hover:brightness-110 disabled:opacity-60"
        >
          <Icon name={tarea ? 'palomita' : 'mas'} strokeWidth={2.2} />
          {pendiente ? 'Guardando…' : tarea ? 'Guardar cambios' : 'Programar tarea'}
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
        {mensaje.error && <span className="text-xs text-peligro">{mensaje.error}</span>}
        {mensaje.ok && !tarea && (
          <span className="flex flex-wrap items-center gap-2 text-xs text-exito">
            {mensaje.ok}
            {avisos.length > 0 && <BotonActivarAvisos compacto />}
          </span>
        )}
      </div>
    </form>
  );
}
