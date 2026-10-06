'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { BotonEnviar, Campo, Mensaje } from '@/components/formulario';
import { Icon } from '@/components/Icon';
import { Boton, clasesBoton, Pill, Tarjeta, Titulo2 } from '@/components/ui';
import type { ClienteFila, ContactoFila, Estado, OportunidadFila } from '@/lib/datos';
import { colorAvatar, haceCuanto, iniciales, tonoEstado } from '@/lib/presentacion';
import { actualizarCliente, guardarContacto, type EstadoFormulario } from '../acciones';

export function FichaCliente({
  cliente,
  oportunidades,
  estados,
  puedeEditar,
  puedeCrearOportunidad,
}: {
  cliente: ClienteFila;
  oportunidades: OportunidadFila[];
  estados: Estado[];
  puedeEditar: boolean;
  puedeCrearOportunidad: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [contactoEnEdicion, setContactoEnEdicion] = useState<string | 'nuevo' | null>(null);
  const nombreEstado = new Map(estados.map((e) => [e.id, e.nombre]));

  return (
    <div className="animar-entrada mx-auto max-w-[1440px]">
      <nav aria-label="Ruta" className="mb-2.5 flex gap-2 text-[13px] text-texto-suave">
        <Link href="/clientes" className="hover:text-texto">
          Clientes
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-semibold text-texto">{cliente.razon_social}</span>
      </nav>

      <header className="mb-6 flex flex-wrap items-center gap-4">
        <span
          aria-hidden="true"
          className="inline-flex size-14 items-center justify-center rounded-lg text-lg font-bold text-white"
          style={{ background: colorAvatar(cliente.razon_social) }}
        >
          {iniciales(cliente.razon_social)}
        </span>
        <div className="mr-auto min-w-0">
          <h1 className="text-[28px] leading-tight font-bold tracking-tight">{cliente.razon_social}</h1>
          <p className="mt-1 text-sm text-texto-suave">
            {[cliente.rfc && `RFC ${cliente.rfc}`, cliente.ciudad, cliente.direccion]
              .filter(Boolean)
              .join(' · ') || 'Sin datos fiscales ni dirección'}
          </p>
        </div>
        {puedeEditar && !editando && (
          <Boton icono="herramienta" onClick={() => setEditando(true)}>
            Editar datos
          </Boton>
        )}
        {puedeCrearOportunidad && (
          <Link href={`/oportunidades/nueva?cliente=${cliente.id}`} className={clasesBoton('primario')}>
            <Icon name="mas" size={18} strokeWidth={2.2} /> Nueva oportunidad
          </Link>
        )}
      </header>

      {editando && <EditarCliente cliente={cliente} onListo={() => setEditando(false)} />}

      <div className="flex flex-wrap items-start gap-5">
        <section aria-labelledby="t-oportunidades" className="min-w-0 flex-[999_1_560px]">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="t-oportunidades" className="text-[17px] font-bold tracking-tight">
              Oportunidades
            </h2>
            <span className="text-[13px] text-texto-suave">{oportunidades.length}</span>
          </div>
          {oportunidades.length === 0 ? (
            <Tarjeta className="px-6 py-10 text-center text-sm text-texto-suave">
              Este cliente aún no tiene oportunidades{puedeCrearOportunidad ? '.' : ' visibles para ti.'}
            </Tarjeta>
          ) : (
            <Tarjeta className="overflow-hidden">
              <ul>
                {oportunidades.map((o, i) => (
                  <li key={o.id} className={i ? 'border-t border-borde' : ''}>
                    <Link
                      href={`/oportunidades/${o.id}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 transition-colors hover:bg-superficie-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{o.nombre}</div>
                        <div className="text-[13px] text-texto-suave">
                          {o.ejecutivo?.nombre} · actualizada {haceCuanto(o.actualizado_en)}
                        </div>
                      </div>
                      <Pill tono={tonoEstado(o.estado_id)}>
                        {nombreEstado.get(o.estado_id) ?? o.estado_id}
                      </Pill>
                    </Link>
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}
        </section>

        <section aria-labelledby="t-contactos" className="min-w-0 flex-[1_1_340px]">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="t-contactos" className="text-[17px] font-bold tracking-tight">
              Contactos
            </h2>
            {puedeEditar && contactoEnEdicion !== 'nuevo' && (
              <Boton
                variante="fantasma"
                tamano="chico"
                icono="mas"
                onClick={() => setContactoEnEdicion('nuevo')}
              >
                Agregar
              </Boton>
            )}
          </div>
          <div className="flex flex-col gap-3">
            {contactoEnEdicion === 'nuevo' && (
              <EditarContacto clienteId={cliente.id} onListo={() => setContactoEnEdicion(null)} />
            )}
            {cliente.contactos.length === 0 && contactoEnEdicion !== 'nuevo' && (
              <Tarjeta className="px-5 py-8 text-center text-sm text-texto-suave">
                Sin contactos registrados.
              </Tarjeta>
            )}
            {cliente.contactos.map((k) =>
              contactoEnEdicion === k.id ? (
                <EditarContacto
                  key={k.id}
                  clienteId={cliente.id}
                  contacto={k}
                  onListo={() => setContactoEnEdicion(null)}
                />
              ) : (
                <Tarjeta key={k.id} className="flex gap-3 p-4">
                  <span
                    aria-hidden="true"
                    className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
                    style={{ background: colorAvatar(k.nombre) }}
                  >
                    {iniciales(k.nombre)}
                  </span>
                  <div className="min-w-0 flex-1 text-[13px]">
                    <div className="text-sm font-semibold">
                      {k.tratamiento} {k.nombre}
                    </div>
                    {k.puesto && <div className="text-texto-suave">{k.puesto}</div>}
                    {k.correo && (
                      <a
                        href={`mailto:${k.correo}`}
                        className="block truncate text-acento-texto hover:underline"
                      >
                        {k.correo}
                      </a>
                    )}
                    {k.telefono && (
                      <a
                        href={`tel:${k.telefono.replace(/\s/g, '')}`}
                        className="block text-texto-suave hover:text-texto"
                      >
                        {k.telefono}
                      </a>
                    )}
                  </div>
                  {puedeEditar && (
                    <button
                      type="button"
                      onClick={() => setContactoEnEdicion(k.id)}
                      aria-label={`Editar a ${k.nombre}`}
                      className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-texto-suave hover:bg-superficie-2 hover:text-texto"
                    >
                      <Icon name="herramienta" size={16} />
                    </button>
                  )}
                </Tarjeta>
              ),
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function EditarCliente({ cliente, onListo }: { cliente: ClienteFila; onListo: () => void }) {
  const [estado, accion] = useActionState<EstadoFormulario, FormData>(
    actualizarCliente.bind(null, cliente.id),
    {},
  );
  return (
    <Tarjeta className="animar-entrada mb-6 p-6">
      <Titulo2>Datos del cliente</Titulo2>
      <form action={accion} className="mt-4 grid gap-4 sm:grid-cols-2">
        {estado.error && (
          <div className="sm:col-span-2">
            <Mensaje>{estado.error}</Mensaje>
          </div>
        )}
        {estado.ok && (
          <div className="sm:col-span-2">
            <Mensaje tono="exito">{estado.ok}</Mensaje>
          </div>
        )}
        <div className="sm:col-span-2">
          <Campo
            etiqueta="Razón social o empresa"
            name="razon_social"
            defaultValue={cliente.razon_social}
            required
          />
        </div>
        <Campo etiqueta="RFC" name="rfc" defaultValue={cliente.rfc ?? ''} maxLength={13} />
        <Campo etiqueta="Ciudad" name="ciudad" defaultValue={cliente.ciudad} />
        <div className="sm:col-span-2">
          <Campo etiqueta="Dirección" name="direccion" defaultValue={cliente.direccion} />
        </div>
        <div className="flex gap-3 sm:col-span-2">
          <div className="w-48">
            <BotonEnviar>Guardar cambios</BotonEnviar>
          </div>
          <Boton onClick={onListo}>Cerrar</Boton>
        </div>
      </form>
    </Tarjeta>
  );
}

function EditarContacto({
  clienteId,
  contacto,
  onListo,
}: {
  clienteId: string;
  contacto?: ContactoFila;
  onListo: () => void;
}) {
  const [estado, accion] = useActionState<EstadoFormulario, FormData>(
    async (previo: EstadoFormulario, datos: FormData) => {
      const r = await guardarContacto(clienteId, contacto?.id ?? null, previo, datos);
      if (r.ok) onListo();
      return r;
    },
    {},
  );
  return (
    <Tarjeta className="animar-entrada p-4">
      <form action={accion} className="flex flex-col gap-3">
        {estado.error && <Mensaje>{estado.error}</Mensaje>}
        <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-2">
          <Campo
            etiqueta="Trat."
            name="tratamiento"
            defaultValue={contacto?.tratamiento}
            placeholder="Ing."
          />
          <Campo etiqueta="Nombre" name="nombre" defaultValue={contacto?.nombre} required autoFocus />
        </div>
        <Campo etiqueta="Puesto" name="puesto" defaultValue={contacto?.puesto} />
        <Campo etiqueta="Correo" name="correo" type="email" defaultValue={contacto?.correo} />
        <Campo etiqueta="Teléfono" name="telefono" type="tel" defaultValue={contacto?.telefono} />
        <div className="flex gap-2">
          <div className="flex-1">
            <BotonEnviar>{contacto ? 'Guardar' : 'Agregar contacto'}</BotonEnviar>
          </div>
          <Boton onClick={onListo}>Cancelar</Boton>
        </div>
      </form>
    </Tarjeta>
  );
}
