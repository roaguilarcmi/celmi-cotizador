'use client';

import { etiquetaRevision } from '@celmi/core';
import Link from 'next/link';
import { useRef, useState, useTransition, type FormEvent } from 'react';
import { Icon } from '@/components/Icon';
import { Boton, clasesBoton, Pill } from '@/components/ui';
import { VentanaFlotante } from '@/components/VentanaFlotante';
import type { CotizacionFila } from '@/lib/datos';
import { crearNuevaRevision, descartarRevision } from '../acciones';
import {
  MOTIVOS_REVISION,
  VISIBILIDADES_REVISION,
  type MotivoRevision,
  type VisibilidadRevision,
} from '@/lib/revisiones';
import { ESTADOS } from '../estados';

const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: 'America/Mexico_City' });

/**
 * Revisiones en el encabezado de la cotización (Fase 3D): cambiar de Rev, crear una nueva a partir de la autorizada,
 * descartar una que nunca se autorizó e ir al historial con la comparación.
 */
export function MenuRevisiones({
  cotizacionId,
  revisiones,
  actual,
  puedeEditar,
}: {
  cotizacionId: string;
  /** De la más reciente a la original. */
  revisiones: CotizacionFila['revisiones'];
  actual: number;
  puedeEditar: boolean;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const [dialogo, setDialogo] = useState<'nueva' | 'descartar' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const ultima = revisiones[0];
  const vista = revisiones.find((r) => r.numero === actual) ?? ultima;
  if (!ultima || !vista) return null;
  const enLaUltima = vista.numero === ultima.numero;
  const puedeNueva =
    puedeEditar && enLaUltima && (ultima.estado === 'autorizada' || ultima.estado === 'emitida');
  const puedeDescartar =
    puedeEditar &&
    enLaUltima &&
    ultima.numero > 0 &&
    !ultima.autorizada_en &&
    (ultima.estado === 'borrador' || ultima.estado === 'rechazada');

  const crear = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (e.target !== e.currentTarget) return;
    const datos = new FormData(e.currentTarget);
    const motivo = String(datos.get('motivo') ?? '');
    const razon = String(datos.get('razon') ?? '');
    const visibilidad = String(datos.get('visibilidad') ?? '');
    iniciar(async () => {
      // Si se crea, la acción lleva a la Rev nueva.
      const r = await crearNuevaRevision(cotizacionId, motivo, razon, visibilidad);
      if (r?.error) setError(r.error);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {revisiones.length > 1 && (
        <details ref={menu} className="relative">
          <summary
            className={`${clasesBoton('secundario', 'chico')} list-none [&::-webkit-details-marker]:hidden`}
          >
            <Icon name="copiar" size={16} />
            {etiquetaRevision(vista.numero)}
            <span className="text-texto-suave">de {revisiones.length}</span>
            <Icon name="derecha" size={14} className="rotate-90" />
          </summary>
          <ul className="absolute right-0 z-40 mt-2 w-80 rounded-lg border border-borde bg-superficie p-1.5 sombra">
            {revisiones.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/cotizaciones/${cotizacionId}?rev=${r.numero}`}
                  onClick={() => menu.current?.removeAttribute('open')}
                  aria-current={r.numero === vista.numero ? 'page' : undefined}
                  className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-superficie-2 ${
                    r.numero === vista.numero ? 'bg-acento-suave' : ''
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{etiquetaRevision(r.numero)}</span>
                    <span className="block text-xs text-texto-suave">
                      {MOTIVOS_REVISION[r.motivo].nombre}
                      {r.numero > 0 && ` · ${VISIBILIDADES_REVISION[r.visibilidad].nombre}`} ·{' '}
                      {fecha.format(new Date(r.creado_en))}
                    </span>
                  </span>
                  <Pill tono={ESTADOS[r.estado].tono}>{ESTADOS[r.estado].texto}</Pill>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
      <Link href={`/cotizaciones/${cotizacionId}/revisiones`} className={clasesBoton('secundario', 'chico')}>
        <Icon name="reloj" size={16} />
        Historial y comparación
      </Link>
      {puedeNueva && (
        <Boton tamano="chico" variante="primario" icono="mas" onClick={() => setDialogo('nueva')}>
          Nueva revisión
        </Boton>
      )}
      {puedeDescartar && (
        <Boton tamano="chico" variante="peligro" icono="cerrar" onClick={() => setDialogo('descartar')}>
          Descartar {etiquetaRevision(ultima.numero)}
        </Boton>
      )}

      {dialogo === 'nueva' && (
        <VentanaFlotante
          titulo={`Crear ${etiquetaRevision(ultima.numero + 1)}`}
          onCerrar={() => {
            setDialogo(null);
            setError(null);
          }}
        >
          <form onSubmit={crear} className="flex flex-col gap-4">
            <p className="text-sm text-texto-suave">
              Se copia {etiquetaRevision(ultima.numero)} completa (partidas, costos, adicionales, cargos y
              condiciones) para modificarla. Vuelve a pasar por autorización: la utilidad anterior se precarga
              como punto de partida y el financiamiento se copia al autorizarla.
            </p>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-[13px] font-bold">1 · Motivo</legend>
              {(['solicitud_cliente', 'mejora_precio', 'error_captura'] as MotivoRevision[]).map((valor) => (
                <label
                  key={valor}
                  className="flex cursor-pointer items-start gap-3 rounded-md border border-borde px-4 py-2.5 hover:bg-superficie-2 has-[:checked]:border-acento has-[:checked]:bg-acento-suave"
                >
                  <input
                    type="radio"
                    name="motivo"
                    value={valor}
                    required
                    className="mt-1 size-4 accent-[var(--c-acento)]"
                  />
                  <span>
                    <span className="block text-sm font-semibold">{MOTIVOS_REVISION[valor].nombre}</span>
                    <span className="block text-[13px] text-texto-suave">
                      {MOTIVOS_REVISION[valor].ayuda}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-bold">2 · Explica la razón</span>
              <textarea
                name="razon"
                required
                minLength={5}
                maxLength={1000}
                rows={3}
                autoComplete="off"
                placeholder="Ej. El cliente pidió 10 equipos más; Ingram bajó el costo del monitor…"
                className="rounded-md border border-borde bg-superficie px-3 py-2 text-sm text-texto outline-none focus:border-acento focus:ring-4 focus:ring-acento-suave"
              />
            </label>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-[13px] font-bold">3 · ¿Cómo se presenta?</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {(['visible', 'interna', 'nuevo_folio'] as VisibilidadRevision[]).map((valor) => (
                  <label
                    key={valor}
                    className="flex cursor-pointer items-start gap-2.5 rounded-md border border-borde px-3 py-2.5 hover:bg-superficie-2 has-[:checked]:border-acento has-[:checked]:bg-acento-suave"
                  >
                    <input
                      type="radio"
                      name="visibilidad"
                      value={valor}
                      required
                      className="mt-1 size-4 shrink-0 accent-[var(--c-acento)]"
                    />
                    <span>
                      <span className="block text-[13px] font-semibold">
                        {VISIBILIDADES_REVISION[valor].nombre}
                      </span>
                      <span className="block text-xs text-texto-suave">
                        {VISIBILIDADES_REVISION[valor].ayuda}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            {error && <p className="text-[13px] font-semibold text-peligro">{error}</p>}
            <div className="flex flex-wrap gap-2.5">
              <Boton type="submit" variante="primario" icono="mas" disabled={pendiente}>
                {pendiente ? 'Creando…' : `Crear ${etiquetaRevision(ultima.numero + 1)}`}
              </Boton>
              <Boton variante="fantasma" onClick={() => setDialogo(null)}>
                Cancelar
              </Boton>
            </div>
          </form>
        </VentanaFlotante>
      )}

      {dialogo === 'descartar' && (
        <VentanaFlotante
          titulo={`¿Descartar ${etiquetaRevision(ultima.numero)}?`}
          onCerrar={() => {
            setDialogo(null);
            setError(null);
          }}
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm">
              Se eliminan sus cambios y la vigente vuelve a ser {etiquetaRevision(ultima.numero - 1)}. No se
              puede deshacer; la auditoría conserva lo descartado.
            </p>
            {error && <p className="text-[13px] font-semibold text-peligro">{error}</p>}
            <div className="flex flex-wrap gap-2.5">
              <Boton
                variante="peligroFuerte"
                icono="cerrar"
                disabled={pendiente}
                onClick={() =>
                  iniciar(async () => {
                    const r = await descartarRevision(ultima.id, cotizacionId);
                    if (r?.error) setError(r.error);
                  })
                }
              >
                {pendiente ? 'Descartando…' : 'Sí, descartar'}
              </Boton>
              <Boton variante="fantasma" onClick={() => setDialogo(null)}>
                Cancelar
              </Boton>
            </div>
          </div>
        </VentanaFlotante>
      )}
    </div>
  );
}
