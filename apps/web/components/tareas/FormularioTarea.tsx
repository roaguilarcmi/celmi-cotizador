'use client';

import { useId, useRef, useState, useTransition, type FormEvent } from 'react';
import { Icon } from '@/components/Icon';
import { crearTarea } from '@/lib/acciones-tareas';
import { BotonActivarAvisos } from './BotonActivarAvisos';

const AVISOS = [
  { id: '0', nombre: 'A la hora' },
  { id: '15', nombre: '15 min antes' },
  { id: '60', nombre: '1 h antes' },
  { id: '1440', nombre: '1 día antes' },
  { id: 'sin', nombre: 'Sin aviso' },
] as const;

const dosDigitos = (n: number) => String(n).padStart(2, '0');

/** Mañana a las 10:00 (hora local), como valor inicial. */
function porOmision() {
  const d = new Date(Date.now() + 86_400_000);
  return {
    fecha: `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`,
    hora: '10:00',
  };
}

export function FormularioTarea({ oportunidadId }: { oportunidadId: string }) {
  const id = useId();
  const formulario = useRef<HTMLFormElement>(null);
  const [aviso, setAviso] = useState<(typeof AVISOS)[number]['id']>('15');
  const [{ fecha, hora }, setCuando] = useState(porOmision);
  const [mensaje, setMensaje] = useState<{ error?: string; ok?: string }>({});
  const [pendiente, iniciar] = useTransition();

  const enviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    const vence = new Date(`${fecha}T${hora}`);
    if (Number.isNaN(vence.getTime())) return setMensaje({ error: 'Elige la fecha y hora.' });
    // El navegador conoce la zona horaria de quien captura: se envía el instante exacto en ISO.
    datos.set('vence_en', vence.toISOString());
    datos.set('aviso', aviso);
    iniciar(async () => {
      const r = await crearTarea(oportunidadId, {}, datos);
      setMensaje(r);
      if (r.ok) {
        formulario.current?.reset();
        setCuando(porOmision());
      }
    });
  };

  const control =
    'h-11 rounded-md border border-borde bg-superficie px-3 text-sm text-texto outline-none focus:border-acento focus:ring-4 focus:ring-acento-suave';

  return (
    <form ref={formulario} onSubmit={enviar} className="rounded-md border border-borde bg-superficie-2 p-3.5">
      <label htmlFor={`${id}-titulo`} className="sr-only">
        ¿Qué hay que hacer?
      </label>
      <input
        id={`${id}-titulo`}
        name="titulo"
        required
        minLength={2}
        maxLength={200}
        autoComplete="off"
        placeholder="¿Qué hay que hacer? Ej. «Llamar a Héctor para confirmar la vigencia»"
        className={`${control} w-full`}
      />
      <div className="mt-2.5 flex flex-wrap items-end gap-2.5">
        <label className="flex flex-col gap-1 text-xs font-semibold text-texto-suave">
          Fecha
          <input
            type="date"
            value={fecha}
            onChange={(e) => setCuando((c) => ({ ...c, fecha: e.target.value }))}
            required
            className={control}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-texto-suave">
          Hora
          <input
            type="time"
            value={hora}
            onChange={(e) => setCuando((c) => ({ ...c, hora: e.target.value }))}
            required
            className={control}
          />
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-xs font-semibold text-texto-suave">Aviso</legend>
          <div className="flex flex-wrap gap-1.5">
            {AVISOS.map((a) => (
              <button
                key={a.id}
                type="button"
                aria-pressed={aviso === a.id}
                onClick={() => setAviso(a.id)}
                className={`inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-pill px-3 text-[13px] font-semibold transition-colors ${
                  aviso === a.id ? 'bg-paso text-white' : 'bg-superficie text-texto-suave hover:text-texto'
                }`}
              >
                {a.id !== 'sin' && <Icon name="campana" size={14} />}
                {a.nombre}
              </button>
            ))}
          </div>
        </fieldset>
        <button
          type="submit"
          disabled={pendiente}
          className="ml-auto inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-acento px-4 text-sm font-semibold text-sobre-acento hover:brightness-110 disabled:opacity-60"
        >
          <Icon name="mas" strokeWidth={2.2} />
          {pendiente ? 'Guardando…' : 'Programar'}
        </button>
      </div>
      {mensaje.error && <p className="mt-2 text-xs text-peligro">{mensaje.error}</p>}
      {mensaje.ok && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-exito">
          {mensaje.ok}
          {aviso !== 'sin' && <BotonActivarAvisos compacto />}
        </div>
      )}
    </form>
  );
}
