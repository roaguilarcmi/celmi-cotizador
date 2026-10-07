'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AtajoBuscar } from '@/components/AtajoBuscar';
import { Buscador, paraBuscar } from '@/components/Buscador';
import { Icon } from '@/components/Icon';
import { Boton, Pill, Tarjeta } from '@/components/ui';
import type { ClienteFila } from '@/lib/datos';
import { colorAvatar, iniciales } from '@/lib/presentacion';
import { FormularioCliente } from './FormularioCliente';

export function ClientesLista({ clientes, puedeCrear }: { clientes: ClienteFila[]; puedeCrear: boolean }) {
  const [busqueda, setBusqueda] = useState('');
  const [alta, setAlta] = useState(false);

  // Búsqueda por empresa, RFC, estado, contacto, correo o teléfono (RFP §24).
  const visibles = useMemo(() => {
    const q = paraBuscar(busqueda.trim());
    if (!q) return clientes;
    const digitos = busqueda.replace(/\D/g, '');
    return clientes.filter(
      (c) =>
        paraBuscar(`${c.razon_social} ${c.rfc} ${c.estado ?? ''} ${c.ciudad}`).includes(q) ||
        c.contactos.some(
          (k) =>
            paraBuscar(`${k.nombre} ${k.correo}`).includes(q) ||
            (digitos.length >= 3 && k.telefono.replace(/\D/g, '').includes(digitos)),
        ),
    );
  }, [busqueda, clientes]);

  return (
    <div className="animar-entrada mx-auto max-w-[1440px]">
      <AtajoBuscar />
      <header className="mb-6 flex flex-wrap items-end gap-4">
        <div className="mr-auto">
          <h1 className="text-[28px] leading-tight font-bold tracking-tight">Clientes</h1>
          <p className="mt-1.5 text-sm text-texto-suave">
            {clientes.length === 1 ? '1 cliente' : `${clientes.length} clientes`} · busca antes de dar de alta
            para no duplicar
          </p>
        </div>
        {puedeCrear && (
          <Boton variante="primario" icono="mas" onClick={() => setAlta((v) => !v)} aria-expanded={alta}>
            Nuevo cliente
          </Boton>
        )}
      </header>

      {alta && (
        <Tarjeta className="animar-entrada mb-6 p-6">
          <FormularioCliente onCancelar={() => setAlta(false)} />
        </Tarjeta>
      )}

      {clientes.length > 0 && (
        <div className="mb-4">
          <Buscador
            valor={busqueda}
            onCambio={setBusqueda}
            placeholder="Empresa, contacto, correo o teléfono…"
            etiqueta="Buscar clientes"
          />
        </div>
      )}

      {clientes.length === 0 ? (
        <Tarjeta className="flex flex-col items-center px-6 py-14 text-center">
          <span className="mb-4 inline-flex size-14 items-center justify-center rounded-pill bg-acento-suave text-acento-texto">
            <Icon name="clientes" size={26} />
          </span>
          <p className="text-lg font-bold">Aún no hay clientes</p>
          <p className="mt-1.5 max-w-md text-sm text-texto-suave">
            Los clientes se dan de alta conforme se usan: al crear la primera oportunidad de cada uno, o aquí
            mismo.
          </p>
          {puedeCrear && !alta && (
            <Boton variante="primario" icono="mas" className="mt-6" onClick={() => setAlta(true)}>
              Dar de alta el primero
            </Boton>
          )}
        </Tarjeta>
      ) : visibles.length === 0 ? (
        <Tarjeta className="px-6 py-10 text-center text-sm text-texto-suave">
          Ningún cliente coincide con «{busqueda}».
        </Tarjeta>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibles.map((c) => {
            const principal = c.contactos[0];
            return (
              <Link
                key={c.id}
                href={`/clientes/${c.id}`}
                className="group flex gap-4 rounded-lg border border-borde bg-superficie p-5 sombra transition-[border-color,transform] hover:-translate-y-0.5 hover:border-acento/50"
              >
                <span
                  aria-hidden="true"
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-sm font-bold text-white"
                  style={{ background: colorAvatar(c.razon_social) }}
                >
                  {iniciales(c.razon_social)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold group-hover:text-acento-texto">{c.razon_social}</div>
                  <div className="truncate text-[13px] text-texto-suave">
                    {[c.estado ?? c.ciudad, c.rfc].filter(Boolean).join(' · ') || 'Sin estado registrado'}
                  </div>
                  {principal ? (
                    <div className="mt-3 truncate text-[13px]">
                      <span className="font-semibold">
                        {principal.tratamiento} {principal.nombre}
                      </span>
                      {principal.puesto && <span className="text-texto-suave"> · {principal.puesto}</span>}
                      <div className="truncate text-texto-suave">
                        {[principal.correo, principal.telefono].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 text-[13px] text-texto-suave">Sin contactos</div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Pill tono={c.oportunidades.length ? 'info' : 'neutro'} punto={false}>
                      {c.oportunidades.length === 1
                        ? '1 oportunidad'
                        : `${c.oportunidades.length} oportunidades`}
                    </Pill>
                    {c.contactos.length > 1 && (
                      <Pill tono="neutro" punto={false}>
                        {c.contactos.length} contactos
                      </Pill>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
