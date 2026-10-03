'use client';

import Link from 'next/link';
import { useActionState, useId, useMemo, useState } from 'react';
import { Buscador, paraBuscar } from '@/components/Buscador';
import { BotonEnviar, Campo, Mensaje } from '@/components/formulario';
import { Icon } from '@/components/Icon';
import { PasosWizard } from '@/components/PasosWizard';
import { Tarjeta, Titulo2 } from '@/components/ui';
import type { ClienteFila, Esquema } from '@/lib/datos';
import { colorAvatar, iniciales } from '@/lib/presentacion';
import { FormularioCliente } from '../../clientes/FormularioCliente';
import { crearOportunidad, type EstadoFormulario } from '../acciones';

const DESCRIPCION_ESQUEMA: Record<string, string> = {
  adquisicion: 'Compra-venta: pago total o anticipo y resto previo a la entrega.',
  arrendamiento_vjm: 'Al terminar, los bienes regresan a la financiera.',
  arrendamiento_fpo: 'Al terminar, los bienes pueden adquirirse por un valor residual.',
  credito_simple: 'Financiamiento a plazo fijo.',
};

export function PasoCliente({
  clientes,
  esquemas,
  clienteInicial,
  ejecutivos,
  usuarioId,
  puedeCrearCliente,
}: {
  clientes: ClienteFila[];
  esquemas: Esquema[];
  clienteInicial: string | null;
  /** Sólo para administradores: a nombre de quién queda la oportunidad. */
  ejecutivos: { id: string; nombre: string }[] | null;
  usuarioId: string;
  puedeCrearCliente: boolean;
}) {
  const [estado, accion] = useActionState<EstadoFormulario, FormData>(crearOportunidad, {});
  const [clienteId, setClienteId] = useState<string | null>(clienteInicial);
  const [busqueda, setBusqueda] = useState('');
  const [nuevoCliente, setNuevoCliente] = useState(false);
  const [esquema, setEsquema] = useState<string>('adquisicion');
  const idObs = useId();

  const cliente = clientes.find((c) => c.id === clienteId) ?? null;
  const sugeridos = useMemo(() => {
    const q = paraBuscar(busqueda.trim());
    const lista = q
      ? clientes.filter((c) =>
          paraBuscar(
            `${c.razon_social} ${c.rfc} ${c.contactos.map((k) => `${k.nombre} ${k.correo}`).join(' ')}`,
          ).includes(q),
        )
      : clientes;
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
          <Titulo2>1 · ¿Para qué cliente?</Titulo2>
          {puedeCrearCliente && !nuevoCliente && !cliente && (
            <button
              type="button"
              onClick={() => setNuevoCliente(true)}
              className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold text-acento-texto hover:bg-acento-suave"
            >
              <Icon name="mas" size={16} /> Cliente nuevo
            </button>
          )}
        </div>

        {nuevoCliente ? (
          <FormularioCliente destino="oportunidad" onCancelar={() => setNuevoCliente(false)} />
        ) : cliente ? (
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
            <button
              type="button"
              onClick={() => setClienteId(null)}
              className="min-h-10 cursor-pointer rounded-md px-3 text-[13px] font-semibold text-acento-texto hover:bg-superficie"
            >
              Cambiar
            </button>
          </div>
        ) : (
          <>
            <Buscador
              valor={busqueda}
              onCambio={setBusqueda}
              placeholder="Busca por empresa, RFC o contacto…"
              etiqueta="Buscar cliente"
            />
            {clientes.length === 0 ? (
              <p className="mt-4 text-sm text-texto-suave">
                Aún no hay clientes. Usa <strong>Cliente nuevo</strong> para dar de alta el primero.
              </p>
            ) : (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {sugeridos.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setClienteId(c.id)}
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
                          {c.contactos[0]?.nombre ?? 'Sin contactos'}
                          {c.ciudad && ` · ${c.ciudad}`}
                        </span>
                      </span>
                    </button>
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
          <input type="hidden" name="esquema_id" value={esquema} />
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
              <div className="flex flex-col gap-1.5">
                <label htmlFor="contacto" className="text-[13px] font-semibold">
                  Contacto
                </label>
                <select
                  id="contacto"
                  name="contacto_id"
                  defaultValue={cliente.contactos[0]?.id ?? ''}
                  className="h-12 rounded-md border border-borde bg-superficie px-3 text-[15px] text-texto outline-none focus:border-acento focus:ring-4 focus:ring-acento-suave"
                >
                  <option value="">Sin contacto</option>
                  {cliente.contactos.map((k) => (
                    <option key={k.id} value={k.id}>
                      {[k.tratamiento, k.nombre].filter(Boolean).join(' ')}
                      {k.puesto && ` · ${k.puesto}`}
                    </option>
                  ))}
                </select>
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
            <Titulo2>3 · Esquema de adquisición</Titulo2>
            <p className="mt-1 text-[13px] text-texto-suave">
              El esquema principal; las alternativas financieras (plazos y corridas) se definen en la
              cotización.
            </p>
            <div
              role="radiogroup"
              aria-label="Esquema de adquisición"
              className="mt-4 grid gap-3 sm:grid-cols-2"
            >
              {esquemas.map((e) => {
                const activo = esquema === e.id;
                return (
                  <button
                    key={e.id}
                    type="button"
                    role="radio"
                    aria-checked={activo}
                    onClick={() => setEsquema(e.id)}
                    className={`flex cursor-pointer flex-col gap-1 rounded-md border-2 p-4 text-left transition-colors ${
                      activo
                        ? 'border-acento bg-acento-suave/50'
                        : 'border-borde bg-superficie hover:border-acento/40'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-bold">{e.nombre}</span>
                      <span
                        aria-hidden="true"
                        className={`inline-flex size-5 items-center justify-center rounded-full border-2 ${
                          activo ? 'border-acento bg-acento text-sobre-acento' : 'border-borde'
                        }`}
                      >
                        {activo && <Icon name="palomita" size={12} strokeWidth={3} />}
                      </span>
                    </span>
                    <span className="text-[13px] text-texto-suave">{DESCRIPCION_ESQUEMA[e.id] ?? ''}</span>
                    {e.plazos_meses.length > 0 && (
                      <span className="mt-1 text-xs font-semibold text-acento-texto">
                        Plazos: {e.plazos_meses.join(', ')} meses
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Tarjeta>

          <Tarjeta className="mb-5 p-6">
            <label htmlFor={idObs} className="text-[17px] font-bold tracking-tight">
              4 · Observaciones internas
            </label>
            <p className="mt-1 text-[13px] text-texto-suave">
              Sólo las ve el equipo; nunca aparecen en la cotización.
            </p>
            <textarea
              id={idObs}
              name="observaciones_internas"
              rows={3}
              className="mt-3 w-full rounded-md border border-borde bg-superficie px-3.5 py-3 text-[15px] text-texto outline-none focus:border-acento focus:ring-4 focus:ring-acento-suave"
            />
          </Tarjeta>

          <section
            aria-label="Continuar"
            className="flex flex-wrap items-center gap-4 rounded-lg bg-nav px-6 py-5 text-white sombra"
          >
            <div className="mr-auto text-sm">
              <div className="font-bold">{cliente.razon_social}</div>
              <div className="text-nav-texto">Siguiente: esquema y partidas de la cotización (Fase 3)</div>
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
