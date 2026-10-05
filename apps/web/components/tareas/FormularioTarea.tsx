'use client';

import type { JSONContent } from '@tiptap/core';
import { useId, useState, useTransition, type FormEvent } from 'react';
import { EditorEnriquecido } from '@/components/EditorEnriquecido';
import { Icon } from '@/components/Icon';
import { actualizarTarea, crearTarea } from '@/lib/acciones-tareas';
import { useVentana } from '@/components/VentanaFlotante';
import type { BorradorTarea, TareaFila } from '@/lib/datos';
import { BotonActivarAvisos } from './BotonActivarAvisos';

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

/** Crear (con `oportunidadId`) o editar/reprogramar (con `tarea`). */
export function FormularioTarea({
  oportunidadId,
  tarea,
  borrador,
  onListo,
}: {
  oportunidadId?: string;
  tarea?: TareaFila;
  /** Valores de un borrador guardado para continuarlo. */
  borrador?: BorradorTarea;
  /** Al guardar con éxito (con el mensaje); si no se pasa, el formulario se vacía para capturar otra. */
  onListo?: (ok: string) => void;
}) {
  const ventana = useVentana();
  const id = useId();
  const [version, setVersion] = useState(0);
  const [avisos, setAvisos] = useState<number[]>(
    () => tarea?.avisos.map((a) => a.minutos_antes) ?? borrador?.avisos ?? [15],
  );
  const [{ fecha, hora }, setCuando] = useState(() =>
    tarea
      ? local(new Date(tarea.vence_en))
      : borrador?.fecha && borrador.hora
        ? { fecha: borrador.fecha, hora: borrador.hora }
        : porOmision(),
  );
  const [mensaje, setMensaje] = useState<{ error?: string; ok?: string }>({});
  const [pendiente, iniciar] = useTransition();

  const alternar = (m: number) =>
    setAvisos((xs) => (xs.includes(m) ? xs.filter((x) => x !== m) : [...xs, m].sort((a, b) => a - b)));

  const enviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    const vence = new Date(`${fecha}T${hora}`);
    if (Number.isNaN(vence.getTime())) return setMensaje({ error: 'Elige la fecha y hora.' });
    // El navegador conoce la zona horaria de quien captura: se envía el instante exacto en ISO.
    datos.set('vence_en', vence.toISOString());
    datos.set('avisos', JSON.stringify(avisos));
    iniciar(async () => {
      const r = tarea
        ? await actualizarTarea(tarea.id, {}, datos)
        : await crearTarea(oportunidadId!, {}, datos);
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
    <form key={version} onSubmit={enviar} className="flex flex-col gap-3">
      <input type="hidden" name="avisos" value={JSON.stringify(avisos)} />
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
          placeholder="Ej. «Llamar a Héctor para confirmar la vigencia»"
          className={`${control} w-full`}
        />
      </div>

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
      </div>

      <fieldset>
        <legend className="mb-1.5 text-xs font-semibold text-texto-suave">
          Avisos <span className="font-normal">(elige uno o varios; ninguno = sin aviso)</span>
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {OPCIONES_AVISO.map((o) => {
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

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-texto-suave">Notas</span>
        <EditorEnriquecido
          nombre="notas"
          inicial={((tarea?.notas ?? borrador?.notas) as JSONContent | null) ?? null}
          etiqueta="Notas de la tarea"
          placeholder="Detalles, datos de contacto, qué preguntar… (opcional)"
          minAlto={72}
        />
      </div>

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
