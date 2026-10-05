'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { BotonEnviar, Campo, Mensaje } from '@/components/formulario';
import { Icon } from '@/components/Icon';
import { Avatar, Boton, Tarjeta, Titulo2 } from '@/components/ui';
import type { ContactoFila, Esquema, Estado, OportunidadFila, SeguimientoFila, TareaFila } from '@/lib/datos';
import { colorAvatar, fechaCorta, haceCuanto, iniciales } from '@/lib/presentacion';
import { actualizarOportunidad, type EstadoFormulario } from '../acciones';
import { SelectorEstado } from '../SelectorEstado';
import { SeccionSeguimiento, SeccionTareas } from './Secciones';

export function FichaOportunidad({
  o,
  estados,
  esquemas,
  contactos,
  seguimiento,
  tareas,
  usuarioId,
  puedeCambiarEstado,
  puedeEditar,
}: {
  o: OportunidadFila;
  estados: Estado[];
  esquemas: Esquema[];
  contactos: ContactoFila[];
  seguimiento: SeguimientoFila[];
  tareas: TareaFila[];
  usuarioId: string;
  puedeCambiarEstado: boolean;
  puedeEditar: boolean;
}) {
  const [editando, setEditando] = useState(false);
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

          <SeccionTareas oportunidadId={o.id} tareas={tareas} />

          <SeccionSeguimiento
            oportunidadId={o.id}
            seguimiento={seguimiento}
            estados={estados}
            usuarioId={usuarioId}
            puedeRegistrar={puedeEditar}
          />
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
