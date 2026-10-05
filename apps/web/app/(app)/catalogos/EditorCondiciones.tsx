'use client';

import type { JSONContent } from '@tiptap/core';
import { useState, useTransition, type FormEvent } from 'react';
import { EditorEnriquecido } from '@/components/EditorEnriquecido';
import { Icon } from '@/components/Icon';
import { TextoEnriquecido } from '@/components/TextoEnriquecido';
import { Tarjeta, Titulo2 } from '@/components/ui';
import { useVentana, VentanaFlotante } from '@/components/VentanaFlotante';
import type { CondicionCatalogo } from '@/lib/datos';
import { mover } from '@/lib/reordenar';
import { MARCADOR_VIGENCIA } from '@/lib/vigencia';
import { cambiarCondicionActiva, guardarCondicion, reordenarCondiciones } from './acciones-condiciones';

/**
 * Catálogo de condiciones comerciales (decisión 2026-10-05): al cotizar se eligen las que aplican y se pueden ajustar
 * para esa cotización. «{vigencia}» se sustituye por la vigencia de cada cotización.
 */
export function EditorCondiciones({
  condiciones: iniciales,
  puedeEditar,
}: {
  condiciones: CondicionCatalogo[];
  puedeEditar: boolean;
}) {
  const [condiciones, setCondiciones] = useState(iniciales);
  const [previas, setPrevias] = useState(iniciales);
  if (iniciales !== previas) {
    setPrevias(iniciales);
    setCondiciones(iniciales);
  }
  const [abierta, setAbierta] = useState<string | 'nueva' | null>(null);
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null);
  const [, iniciar] = useTransition();

  const avisar = (r: { error?: string; ok?: string }) =>
    setMensaje(r.error ? { texto: r.error, error: true } : { texto: r.ok ?? '' });

  const reordenar = (i: number, j: number) => {
    const nuevas = mover(condiciones, i, j);
    setCondiciones(nuevas);
    iniciar(async () => avisar(await reordenarCondiciones(nuevas.map((c) => c.id))));
  };

  const editando = condiciones.find((c) => c.id === abierta);

  return (
    <Tarjeta className="mt-6 overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-borde px-6 py-4">
        <div className="mr-auto">
          <Titulo2>Condiciones comerciales</Titulo2>
          <p className="mt-0.5 text-[13px] text-texto-suave">
            Al cotizar se eligen las que aplican y se pueden ajustar para esa cotización. Escribe{' '}
            <code className="rounded-sm bg-superficie-2 px-1 font-mono text-xs">{MARCADOR_VIGENCIA}</code>{' '}
            donde deba aparecer la fecha de vigencia.
          </p>
        </div>
        {puedeEditar && (
          <button
            type="button"
            onClick={() => setAbierta('nueva')}
            className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md bg-acento px-4 text-[13px] font-semibold text-sobre-acento hover:brightness-110"
          >
            <Icon name="mas" size={16} strokeWidth={2.4} />
            Nueva condición
          </button>
        )}
      </div>

      {mensaje && (
        <p
          className={`border-b border-borde px-6 py-2 text-[13px] font-semibold ${mensaje.error ? 'text-peligro' : 'text-exito'}`}
        >
          {mensaje.texto}
        </p>
      )}

      {condiciones.length === 0 ? (
        <p className="px-6 py-10 text-center text-[13px] text-texto-suave">
          Aún no hay condiciones.{' '}
          {puedeEditar
            ? 'Agrega las que usas en tus cotizaciones (forma de pago, garantía, entrega, vigencia…).'
            : ''}
        </p>
      ) : (
        <ol>
          {condiciones.map((c, i) => (
            <li
              key={c.id}
              className={`group flex items-start gap-3 border-b border-borde px-4 py-3 last:border-0 ${c.activa ? '' : 'opacity-55'}`}
            >
              {puedeEditar && (
                <span className="flex flex-col">
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => reordenar(i, i - 1)}
                    aria-label={`Subir «${c.nombre}»`}
                    className="inline-flex size-7 cursor-pointer items-center justify-center rounded-sm text-texto-suave hover:bg-superficie-2 disabled:opacity-30"
                  >
                    <Icon name="derecha" size={13} className="-rotate-90" />
                  </button>
                  <button
                    type="button"
                    disabled={i === condiciones.length - 1}
                    onClick={() => reordenar(i, i + 1)}
                    aria-label={`Bajar «${c.nombre}»`}
                    className="inline-flex size-7 cursor-pointer items-center justify-center rounded-sm text-texto-suave hover:bg-superficie-2 disabled:opacity-30"
                  >
                    <Icon name="derecha" size={13} className="rotate-90" />
                  </button>
                </span>
              )}
              <div className="min-w-0 flex-1 pt-1">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {c.nombre}
                  {!c.activa && (
                    <span className="rounded-pill bg-superficie-2 px-2 text-[11px] text-texto-suave">
                      Inactiva
                    </span>
                  )}
                </div>
                <div className="mt-1 line-clamp-2 text-texto-suave [&_.texto-enriquecido]:text-[13px]">
                  <TextoEnriquecido contenido={c.contenido} respaldo="" />
                </div>
              </div>
              {puedeEditar && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => iniciar(async () => avisar(await cambiarCondicionActiva(c.id, !c.activa)))}
                    className="min-h-8 cursor-pointer rounded-md px-2.5 text-xs font-semibold text-texto-suave hover:bg-superficie-2 hover:text-texto"
                  >
                    {c.activa ? 'Desactivar' : 'Activar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAbierta(c.id)}
                    aria-label={`Editar «${c.nombre}»`}
                    className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-texto-suave hover:bg-superficie-2 hover:text-texto"
                  >
                    <Icon name="herramienta" size={15} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {(abierta === 'nueva' || editando) && (
        <VentanaFlotante
          titulo={editando ? 'Editar condición' : 'Nueva condición'}
          detalle={`Usa viñetas y negritas como en tus cotizaciones. ${MARCADOR_VIGENCIA} se sustituye por la vigencia.`}
          esEdicion={Boolean(editando)}
          onCerrar={() => setAbierta(null)}
        >
          <FormularioCondicion
            inicial={editando ?? null}
            onGuardado={(r) => {
              avisar(r);
              if (!r.error) setAbierta(null);
            }}
          />
        </VentanaFlotante>
      )}
    </Tarjeta>
  );
}

function FormularioCondicion({
  inicial,
  onGuardado,
}: {
  inicial: CondicionCatalogo | null;
  onGuardado: (r: { error?: string; ok?: string }) => void;
}) {
  const ventana = useVentana();
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const enviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const contenido = String(new FormData(e.currentTarget).get('contenido') ?? '');
    iniciar(async () => {
      const r = await guardarCondicion(inicial?.id ?? null, nombre, contenido);
      if (r.error) setError(r.error);
      else onGuardado(r);
    });
  };
  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-xs font-semibold text-texto-suave">
        Nombre (para identificarla al cotizar)
        <input
          name="nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          maxLength={120}
          required
          placeholder="Forma de pago"
          className="h-10 rounded-md border-2 border-texto/20 bg-superficie px-3 text-sm text-texto outline-none focus:border-acento focus:ring-4 focus:ring-acento-suave"
        />
      </label>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-texto-suave">Texto</span>
        <EditorEnriquecido
          nombre="contenido"
          inicial={(inicial?.contenido as JSONContent | null) ?? null}
          etiqueta="Texto de la condición"
          placeholder="Precios en pesos mexicanos más IVA. Cotización válida hasta {vigencia}."
          minAlto={120}
        />
      </div>
      {error && <p className="text-xs text-peligro">{error}</p>}
      <div className="flex gap-2.5">
        <button
          type="submit"
          disabled={pendiente}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-acento px-4 text-sm font-semibold text-sobre-acento hover:brightness-110 disabled:opacity-60"
        >
          <Icon name="palomita" strokeWidth={2.2} />
          {pendiente ? 'Guardando…' : 'Guardar'}
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
