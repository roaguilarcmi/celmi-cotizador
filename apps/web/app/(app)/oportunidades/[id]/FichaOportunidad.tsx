'use client';

import Link from 'next/link';
import { useActionState, useRef, useState } from 'react';
import { BotonEnviar, Campo, Mensaje } from '@/components/formulario';
import { Icon, type IconName } from '@/components/Icon';
import { Avatar, Boton, Pill, Tarjeta, Titulo2 } from '@/components/ui';
import type { ContactoFila, Esquema, Estado, OportunidadFila, SeguimientoFila } from '@/lib/datos';
import { colorAvatar, fechaCorta, fechaHora, haceCuanto, iniciales, tonoEstado } from '@/lib/presentacion';
import { actualizarOportunidad, agregarNota, type EstadoFormulario } from '../acciones';
import { SelectorEstado } from '../SelectorEstado';

const TIPOS: { id: 'nota' | 'llamada' | 'visita' | 'correo'; nombre: string; icono: IconName }[] = [
  { id: 'nota', nombre: 'Nota', icono: 'cotizaciones' },
  { id: 'llamada', nombre: 'Llamada', icono: 'telefono' },
  { id: 'visita', nombre: 'Visita', icono: 'clientes' },
  { id: 'correo', nombre: 'Correo', icono: 'mensaje' },
];

export function FichaOportunidad({
  o,
  estados,
  esquemas,
  contactos,
  seguimiento,
  puedeCambiarEstado,
  puedeEditar,
}: {
  o: OportunidadFila;
  estados: Estado[];
  esquemas: Esquema[];
  contactos: ContactoFila[];
  seguimiento: SeguimientoFila[];
  puedeCambiarEstado: boolean;
  puedeEditar: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const nombreEstado = new Map(estados.map((e) => [e.id, e.nombre]));
  const esquema = esquemas.find((e) => e.id === o.esquema_id);

  return (
    <div className="animar-entrada mx-auto max-w-[1440px]">
      <nav aria-label="Ruta" className="mb-2.5 flex flex-wrap gap-2 text-[13px] text-texto-suave">
        <Link href="/oportunidades" className="hover:text-texto">
          Oportunidades
        </Link>
        <span aria-hidden="true">/</span>
        {o.cliente && (
          <>
            <Link href={`/clientes/${o.cliente.id}`} className="hover:text-texto">
              {o.cliente.razon_social}
            </Link>
            <span aria-hidden="true">/</span>
          </>
        )}
        <span className="font-semibold text-texto">{o.nombre}</span>
      </nav>

      <header className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="mr-auto min-w-0">
          <h1 className="text-[28px] leading-tight font-bold tracking-tight">{o.nombre}</h1>
          <p className="mt-1 text-sm text-texto-suave">
            {o.cliente?.razon_social} · creada el {fechaCorta(o.creado_en)} · última actividad{' '}
            {haceCuanto(o.actualizado_en)}
          </p>
        </div>
        <SelectorEstado
          oportunidadId={o.id}
          estadoId={o.estado_id}
          estados={estados}
          puedeCambiar={puedeCambiarEstado}
        />
        {puedeEditar && !editando && (
          <Boton icono="herramienta" onClick={() => setEditando(true)}>
            Editar
          </Boton>
        )}
      </header>

      {editando && (
        <EditarOportunidad
          o={o}
          contactos={contactos}
          esquemas={esquemas}
          onListo={() => setEditando(false)}
        />
      )}

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
          <Tarjeta className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Titulo2>Cotizaciones</Titulo2>
              <button
                type="button"
                disabled
                title="Disponible en la Fase 3"
                className="inline-flex min-h-10 cursor-not-allowed items-center gap-2 rounded-md bg-acento px-4 text-sm font-semibold text-sobre-acento opacity-50"
              >
                <Icon name="mas" strokeWidth={2.2} /> Nueva cotización
              </button>
            </div>
            <p className="mt-3 rounded-md border border-dashed border-borde px-4 py-6 text-center text-[13px] text-texto-suave">
              Aquí aparecerán las cotizaciones de esta oportunidad, con sus propuestas, revisiones y folio.
              Llegan en la Fase 3.
            </p>
          </Tarjeta>

          <Tarjeta className="p-6">
            <Titulo2>Seguimiento</Titulo2>
            {puedeEditar && <NuevaNota oportunidadId={o.id} />}
            <ol className="mt-5 flex flex-col">
              {seguimiento.length === 0 && (
                <li className="py-6 text-center text-[13px] text-texto-suave">
                  Aún no hay movimientos registrados.
                </li>
              )}
              {seguimiento.map((s, i) => (
                <li key={s.id} className="relative flex gap-3.5 pb-5">
                  {i < seguimiento.length - 1 && (
                    <span aria-hidden="true" className="absolute top-9 bottom-0 left-[17px] w-px bg-borde" />
                  )}
                  {s.tipo === 'cambio_estado' ? (
                    <span className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-acento-suave text-acento-texto">
                      <Icon name="derecha" size={16} />
                    </span>
                  ) : (
                    <Avatar
                      iniciales={iniciales(s.autor?.nombre ?? '?')}
                      color={colorAvatar(s.autor?.nombre ?? '?')}
                      tamano={36}
                    />
                  )}
                  <div className="min-w-0 flex-1 pt-1">
                    <div className="text-[13px]">
                      <strong>{s.autor?.nombre ?? 'Sistema'}</strong>{' '}
                      {s.tipo === 'cambio_estado' ? (
                        <span className="text-texto-suave">
                          cambió el estado{' '}
                          {s.estado_anterior && (
                            <>
                              de{' '}
                              <Pill tono={tonoEstado(s.estado_anterior)} punto={false}>
                                {nombreEstado.get(s.estado_anterior) ?? s.estado_anterior}
                              </Pill>{' '}
                            </>
                          )}
                          a{' '}
                          <Pill tono={tonoEstado(s.estado_nuevo ?? '')} punto={false}>
                            {nombreEstado.get(s.estado_nuevo ?? '') ?? s.estado_nuevo}
                          </Pill>
                        </span>
                      ) : (
                        <span className="text-texto-suave">
                          registró {TIPOS.find((t) => t.id === s.tipo)?.nombre.toLowerCase()}
                        </span>
                      )}
                      <span className="text-texto-suave"> · {fechaHora(s.en)}</span>
                    </div>
                    {s.texto && (
                      <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-line">{s.texto}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Tarjeta>
        </div>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-5">
          <Tarjeta className="p-5">
            <Titulo2>Datos</Titulo2>
            <dl className="mt-4 flex flex-col gap-3.5 text-sm">
              <Dato etiqueta="Cliente">
                {o.cliente ? (
                  <Link
                    href={`/clientes/${o.cliente.id}`}
                    className="font-semibold text-acento-texto hover:underline"
                  >
                    {o.cliente.razon_social}
                  </Link>
                ) : (
                  '—'
                )}
              </Dato>
              <Dato etiqueta="Contacto">
                {o.contacto ? (
                  <>
                    <div className="font-semibold">
                      {o.contacto.tratamiento} {o.contacto.nombre}
                    </div>
                    <div className="text-[13px] text-texto-suave">
                      {[o.contacto.puesto, o.contacto.correo, o.contacto.telefono]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </>
                ) : (
                  'Sin contacto'
                )}
              </Dato>
              <Dato etiqueta="Esquema de adquisición">{esquema?.nombre ?? '—'}</Dato>
              <Dato etiqueta="Ciudad de entrega">{o.ciudad_entrega || '—'}</Dato>
              <Dato etiqueta="Ejecutivo responsable">
                {o.ejecutivo && (
                  <span className="inline-flex items-center gap-2">
                    <Avatar
                      iniciales={iniciales(o.ejecutivo.nombre)}
                      color={colorAvatar(o.ejecutivo.nombre)}
                      tamano={24}
                    />
                    {o.ejecutivo.nombre}
                  </span>
                )}
              </Dato>
            </dl>
          </Tarjeta>
          <Tarjeta className="p-5">
            <div className="flex items-center gap-2">
              <Icon name="candado" size={16} className="text-texto-suave" />
              <Titulo2>Observaciones internas</Titulo2>
            </div>
            <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-texto-suave">
              {o.observaciones_internas || 'Sin observaciones.'}
            </p>
          </Tarjeta>
        </aside>
      </div>
    </div>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-texto-suave">{etiqueta}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function NuevaNota({ oportunidadId }: { oportunidadId: string }) {
  const formulario = useRef<HTMLFormElement>(null);
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]['id']>('nota');
  const [estado, accion] = useActionState<EstadoFormulario, FormData>(
    async (previo: EstadoFormulario, datos: FormData) => {
      const r = await agregarNota(oportunidadId, previo, datos);
      if (r.ok) formulario.current?.reset();
      return r;
    },
    {},
  );
  return (
    <form
      ref={formulario}
      action={accion}
      className="mt-4 rounded-md border border-borde bg-superficie-2 p-3"
    >
      <input type="hidden" name="tipo" value={tipo} />
      <div role="radiogroup" aria-label="Tipo de registro" className="mb-2 flex flex-wrap gap-1.5">
        {TIPOS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={tipo === t.id}
            onClick={() => setTipo(t.id)}
            className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-pill px-3 text-[13px] font-semibold transition-colors ${
              tipo === t.id ? 'bg-paso text-white' : 'bg-superficie text-texto-suave hover:text-texto'
            }`}
          >
            <Icon name={t.icono} size={15} />
            {t.nombre}
          </button>
        ))}
      </div>
      <label className="sr-only" htmlFor={`nota-${oportunidadId}`}>
        Texto
      </label>
      <textarea
        id={`nota-${oportunidadId}`}
        name="texto"
        rows={2}
        required
        placeholder="¿Qué pasó? Ej. «El cliente pidió cotizar también 2 docking stations»"
        className="w-full resize-y rounded-md border border-borde bg-superficie px-3 py-2.5 text-sm text-texto outline-none focus:border-acento focus:ring-4 focus:ring-acento-suave"
      />
      {estado.error && <p className="mt-1 text-xs text-peligro">{estado.error}</p>}
      <div className="mt-2 flex justify-end">
        <div className="w-40">
          <BotonEnviar>Registrar</BotonEnviar>
        </div>
      </div>
    </form>
  );
}

function EditarOportunidad({
  o,
  contactos,
  esquemas,
  onListo,
}: {
  o: OportunidadFila;
  contactos: ContactoFila[];
  esquemas: Esquema[];
  onListo: () => void;
}) {
  const [estado, accion] = useActionState<EstadoFormulario, FormData>(
    async (previo: EstadoFormulario, datos: FormData) => {
      const r = await actualizarOportunidad(o.id, previo, datos);
      if (r.ok) onListo();
      return r;
    },
    {},
  );
  const select =
    'h-12 rounded-md border border-borde bg-superficie px-3 text-[15px] text-texto outline-none focus:border-acento focus:ring-4 focus:ring-acento-suave';
  return (
    <Tarjeta className="animar-entrada mb-6 p-6">
      <Titulo2>Editar oportunidad</Titulo2>
      <form action={accion} className="mt-4 grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="cliente_id" value={o.cliente?.id ?? ''} />
        {estado.error && (
          <div className="sm:col-span-2">
            <Mensaje>{estado.error}</Mensaje>
          </div>
        )}
        <div className="sm:col-span-2">
          <Campo
            etiqueta="Nombre o descripción del proyecto"
            name="nombre"
            defaultValue={o.nombre}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ed-contacto" className="text-[13px] font-semibold">
            Contacto
          </label>
          <select id="ed-contacto" name="contacto_id" defaultValue={o.contacto?.id ?? ''} className={select}>
            <option value="">Sin contacto</option>
            {contactos.map((k) => (
              <option key={k.id} value={k.id}>
                {[k.tratamiento, k.nombre].filter(Boolean).join(' ')}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ed-esquema" className="text-[13px] font-semibold">
            Esquema de adquisición
          </label>
          <select id="ed-esquema" name="esquema_id" defaultValue={o.esquema_id ?? ''} className={select}>
            {esquemas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        </div>
        <Campo etiqueta="Ciudad de entrega" name="ciudad_entrega" defaultValue={o.ciudad_entrega} />
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="ed-obs" className="text-[13px] font-semibold">
            Observaciones internas
          </label>
          <textarea
            id="ed-obs"
            name="observaciones_internas"
            rows={3}
            defaultValue={o.observaciones_internas}
            className="rounded-md border border-borde bg-superficie px-3.5 py-3 text-[15px] text-texto outline-none focus:border-acento focus:ring-4 focus:ring-acento-suave"
          />
        </div>
        <div className="flex gap-3 sm:col-span-2">
          <div className="w-48">
            <BotonEnviar>Guardar cambios</BotonEnviar>
          </div>
          <Boton onClick={onListo}>Cancelar</Boton>
        </div>
      </form>
    </Tarjeta>
  );
}
