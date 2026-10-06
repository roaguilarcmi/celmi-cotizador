'use client';

import { etiquetaRevision } from '@celmi/core';
import Link from 'next/link';
import { useRef, useState, useTransition, type FormEvent } from 'react';
import { Icon } from '@/components/Icon';
import { Boton, clasesBoton, Pill } from '@/components/ui';
import { VentanaFlotante } from '@/components/VentanaFlotante';
import type { CotizacionFila } from '@/lib/datos';
import { crearNuevaRevision, descartarRevision } from '../acciones';
import { ESTADOS } from '../estados';

const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: 'America/Mexico_City' });

const MOTIVOS = {
  inicial: 'Original',
  solicitud_cliente: 'Solicitud del cliente',
  mejora_precio: 'Mejora de precio',
} as const;

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
    const motivo = String(new FormData(e.currentTarget).get('motivo') ?? '');
    iniciar(async () => {
      // Si se crea, la acción lleva a la Rev nueva.
      const r = await crearNuevaRevision(cotizacionId, motivo);
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
                      {MOTIVOS[r.motivo]} · {fecha.format(new Date(r.creado_en))}
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
            <fieldset className="flex flex-col gap-2.5">
              <legend className="mb-1 text-xs font-semibold text-texto-suave">Motivo</legend>
              {(
                [
                  [
                    'solicitud_cliente',
                    'Solicitud del cliente',
                    'Cambios que pide el cliente: cantidades, equipos, condiciones…',
                  ],
                  [
                    'mejora_precio',
                    'Mejora de precio',
                    'El mayorista mejoró su costo. El costo actual queda como «Precio anterior» para ver la mejora.',
                  ],
                ] as const
              ).map(([valor, titulo, ayuda]) => (
                <label
                  key={valor}
                  className="flex cursor-pointer items-start gap-3 rounded-md border border-borde px-4 py-3 hover:bg-superficie-2 has-[:checked]:border-acento has-[:checked]:bg-acento-suave"
                >
                  <input
                    type="radio"
                    name="motivo"
                    value={valor}
                    required
                    className="mt-1 size-4 accent-[var(--c-acento)]"
                  />
                  <span>
                    <span className="block text-sm font-semibold">{titulo}</span>
                    <span className="block text-[13px] text-texto-suave">{ayuda}</span>
                  </span>
                </label>
              ))}
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
