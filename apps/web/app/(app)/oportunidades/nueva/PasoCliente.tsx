'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import { Buscador, paraBuscar } from '@/components/Buscador';
import { EditorEnriquecido } from '@/components/EditorEnriquecido';
import { BotonEnviar, Campo, Mensaje } from '@/components/formulario';
import { Icon } from '@/components/Icon';
import { PasosWizard } from '@/components/PasosWizard';
import { Boton, Tarjeta, Titulo2 } from '@/components/ui';
import type { ClienteFila } from '@/lib/datos';
import { colorAvatar, iniciales } from '@/lib/presentacion';
import { TIPOS_OPORTUNIDAD, type TipoOportunidad } from '@/lib/tipos-oportunidad';
import { FormularioCliente } from '../../clientes/FormularioCliente';
import { crearOportunidad, type EstadoFormulario } from '../acciones';
import { SeleccionContacto } from './SeleccionContacto';

export function PasoCliente({
  clientes,
  clienteInicial,
  ejecutivos,
  usuarioId,
  puedeCrearCliente,
}: {
  clientes: ClienteFila[];
  clienteInicial: string | null;
  /** Sólo para administradores: a nombre de quién queda la oportunidad. */
  ejecutivos: { id: string; nombre: string }[] | null;
  usuarioId: string;
  puedeCrearCliente: boolean;
}) {
  const [estado, accion] = useActionState<EstadoFormulario, FormData>(crearOportunidad, {});
  const [clienteId, setClienteId] = useState<string | null>(clienteInicial);
  // Contacto que solicita ('' = sin contacto). Al elegir cliente se propone su primer contacto.
  const [contactoId, setContactoId] = useState<string>(
    () => clientes.find((c) => c.id === clienteInicial)?.contactos[0]?.id ?? '',
  );
  const elegir = (id: string, contacto?: string) => {
    setClienteId(id);
    setContactoId(contacto ?? clientes.find((c) => c.id === id)?.contactos[0]?.id ?? '');
  };
  const [busqueda, setBusqueda] = useState('');
  const [nuevoCliente, setNuevoCliente] = useState(false);
  const [tipo, setTipo] = useState<TipoOportunidad>('arrendamiento');

  const cliente = clientes.find((c) => c.id === clienteId) ?? null;
  const sugeridos = useMemo(() => {
    const q = paraBuscar(busqueda.trim());
    const datosDe = (k: ClienteFila['contactos'][number]) =>
      paraBuscar(`${k.tratamiento} ${k.nombre} ${k.puesto} ${k.correo} ${k.telefono}`);
    const lista = clientes
      .map((c) => ({
        c,
        contactos: q ? c.contactos.filter((k) => datosDe(k).includes(q)) : [],
        empresa: !q || paraBuscar(`${c.razon_social} ${c.rfc}`).includes(q),
      }))
      .filter((x) => x.empresa || x.contactos.length > 0);
    return lista.slice(0, 8);
  }, [busqueda, clientes]);

  return (
    <div className="animar-entrada mx-auto max-w-[1100px]">
      <nav aria-label="Ruta" className="mb-2.5 flex gap-2 text-[13px] text-texto-suave">
        <Link href="/oportunidades" className="hover:text-texto">
          Oportunidades
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-semibold text-texto">Nueva</span>
      </nav>
      <h1 className="mb-5 text-[28px] leading-tight font-bold tracking-tight">Nueva oportunidad</h1>
      <div className="mb-6">
        <PasosWizard actual={0} />
      </div>

      {/* 1 · Cliente */}
      <Tarjeta className="mb-5 p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Titulo2>1 · Cliente y contacto</Titulo2>
          {puedeCrearCliente && !nuevoCliente && !cliente && (
            <Boton tamano="chico" icono="mas" onClick={() => setNuevoCliente(true)}>
              Cliente nuevo
            </Boton>
          )}
        </div>

        {nuevoCliente ? (
          <FormularioCliente destino="oportunidad" onCancelar={() => setNuevoCliente(false)} />
        ) : cliente ? (
          <>
            <div className="flex flex-wrap items-center gap-4 rounded-md border-2 border-acento/40 bg-acento-suave/40 p-4">
              <span
                aria-hidden="true"
                className="inline-flex size-11 items-center justify-center rounded-md text-sm font-bold text-white"
                style={{ background: colorAvatar(cliente.razon_social) }}
              >
                {iniciales(cliente.razon_social)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-bold">{cliente.razon_social}</div>
                <div className="text-[13px] text-texto-suave">
                  {[cliente.ciudad, cliente.rfc].filter(Boolean).join(' · ') || 'Sin ciudad ni RFC'}
                </div>
              </div>
              <Boton tamano="chico" onClick={() => setClienteId(null)}>
                Cambiar cliente
              </Boton>
            </div>
            <SeleccionContacto
              key={cliente.id}
              cliente={cliente}
              contactoId={contactoId}
              onElegir={setContactoId}
              puedeCrear={puedeCrearCliente}
            />
          </>
        ) : (
          <>
            <Buscador
              valor={busqueda}
              onCambio={setBusqueda}
              placeholder="Busca por empresa, RFC, contacto, correo o teléfono…"
              etiqueta="Buscar cliente"
            />
            {clientes.length === 0 ? (
              <p className="mt-4 text-sm text-texto-suave">
                Aún no hay clientes. Usa <strong>Cliente nuevo</strong> para dar de alta el primero.
              </p>
            ) : (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {sugeridos.map(({ c, contactos }) => (
                  <li key={c.id} className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => elegir(c.id)}
                      className="flex w-full cursor-pointer items-center gap-3 rounded-md border border-borde bg-superficie p-3 text-left transition-colors hover:border-acento/50 hover:bg-superficie-2"
                    >
                      <span
                        aria-hidden="true"
                        className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
                        style={{ background: colorAvatar(c.razon_social) }}
                      >
                        {iniciales(c.razon_social)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{c.razon_social}</span>
                        <span className="block truncate text-xs text-texto-suave">
                          {c.contactos.length === 0
                            ? 'Sin contactos'
                            : c.contactos.length === 1
                              ? c.contactos[0]?.nombre
                              : `${c.contactos.length} contactos`}
                          {c.ciudad && ` · ${c.ciudad}`}
                        </span>
                      </span>
                    </button>
                    {contactos.map((k) => (
                      <button
                        key={k.id}
                        type="button"
                        onClick={() => elegir(c.id, k.id)}
                        className="ml-6 flex cursor-pointer items-center gap-2 rounded-md border border-borde bg-superficie px-3 py-2 text-left text-[13px] hover:border-acento/50 hover:bg-superficie-2"
                      >
                        <Icon name="clientes" size={14} className="shrink-0 text-texto-suave" />
                        <span className="min-w-0 truncate">
                          <strong>{[k.tratamiento, k.nombre].filter(Boolean).join(' ')}</strong>
                          {k.puesto && <span className="text-texto-suave"> · {k.puesto}</span>}
                        </span>
                      </button>
                    ))}
                  </li>
                ))}
                {sugeridos.length === 0 && (
                  <li className="text-sm text-texto-suave sm:col-span-2">
                    Ningún cliente coincide.{' '}
                    {puedeCrearCliente && 'Puedes darlo de alta con «Cliente nuevo».'}
                  </li>
                )}
              </ul>
            )}
          </>
        )}
      </Tarjeta>

      {/* 2 · Oportunidad */}
      {cliente && !nuevoCliente && (
        <form action={accion} className="animar-entrada">
          <input type="hidden" name="cliente_id" value={cliente.id} />
          <input type="hidden" name="tipo" value={tipo} />
          <input type="hidden" name="contacto_id" value={contactoId} />
          <Tarjeta className="mb-5 p-6">
            <Titulo2>2 · La oportunidad</Titulo2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {estado.error && (
                <div className="sm:col-span-2">
                  <Mensaje>{estado.error}</Mensaje>
                </div>
              )}
              <div className="sm:col-span-2">
                <Campo
                  etiqueta="Nombre o descripción del proyecto"
                  name="nombre"
                  required
                  autoFocus
                  autoComplete="off"
                  placeholder="Ej. Renovación de 2 laptops"
                />
              </div>
              <Campo
                etiqueta="Ciudad de entrega"
                name="ciudad_entrega"
                defaultValue={cliente.ciudad}
                autoComplete="off"
              />
              {ejecutivos && (
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label htmlFor="ejecutivo" className="text-[13px] font-semibold">
                    Ejecutivo responsable
                  </label>
                  <select
                    id="ejecutivo"
                    name="ejecutivo_id"
                    defaultValue={usuarioId}
                    className="h-12 rounded-md border border-borde bg-superficie px-3 text-[15px] text-texto outline-none focus:border-acento"
                  >
                    {ejecutivos.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nombre}
                        {e.id === usuarioId ? ' (yo)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </Tarjeta>

          <Tarjeta className="mb-5 p-6">
            <Titulo2>3 · Tipo</Titulo2>
            <p className="mt-1 text-[13px] text-texto-suave">
              Sólo el tipo general. Los esquemas de financiamiento y sus plazos se eligen por propuesta al
              cotizar.
            </p>
            <div
              role="radiogroup"
              aria-label="Tipo de oportunidad"
              className="mt-4 grid gap-3 sm:grid-cols-3"
            >
              {(Object.keys(TIPOS_OPORTUNIDAD) as TipoOportunidad[]).map((t) => {
                const activo = tipo === t;
                return (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={activo}
                    onClick={() => setTipo(t)}
                    className={`flex cursor-pointer flex-col gap-1 rounded-md border-2 p-4 text-left transition-colors ${
                      activo
                        ? 'border-acento bg-acento-suave/50'
                        : 'border-borde bg-superficie hover:border-acento/40'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-bold">{TIPOS_OPORTUNIDAD[t].nombre}</span>
                      <span
                        aria-hidden="true"
                        className={`inline-flex size-5 items-center justify-center rounded-full border-2 ${
                          activo ? 'border-acento bg-acento text-sobre-acento' : 'border-borde'
                        }`}
                      >
                        {activo && <Icon name="palomita" size={12} strokeWidth={3} />}
                      </span>
                    </span>
                    <span className="text-[13px] text-texto-suave">{TIPOS_OPORTUNIDAD[t].descripcion}</span>
                  </button>
                );
              })}
            </div>
          </Tarjeta>

          <Tarjeta className="mb-5 p-6">
            <Titulo2>4 · Observaciones internas</Titulo2>
            <p className="mt-1 mb-3 text-[13px] text-texto-suave">
              Sólo las ve el equipo; nunca aparecen en la cotización.
            </p>
            <EditorEnriquecido
              nombre="observaciones_contenido"
              etiqueta="Observaciones internas"
              placeholder="Ej. El cliente pide entrega antes de fin de mes."
            />
          </Tarjeta>

          <section
            aria-label="Continuar"
            className="flex flex-wrap items-center gap-4 rounded-lg bg-nav px-6 py-5 text-white sombra"
          >
            <div className="mr-auto text-sm">
              <div className="font-bold">{cliente.razon_social}</div>
              <div className="text-nav-texto">Siguiente: crea la cotización desde la oportunidad</div>
            </div>
            <div className="w-full sm:w-64">
              <BotonEnviar>Crear oportunidad</BotonEnviar>
            </div>
          </section>
        </form>
      )}
    </div>
  );
}
