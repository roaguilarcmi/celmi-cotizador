'use client';

import { fechaHoraAuditoria, nombreRevision } from '@celmi/core';
import Link from 'next/link';
import { useState } from 'react';
import { DetalleAccion, Frase, Persona, porDia } from '@/components/auditoria/Piezas';
import { Icon, type IconName } from '@/components/Icon';
import { VentanaFlotante } from '@/components/VentanaFlotante';
import { clasesBoton } from '@/components/ui';
import type { AccionVista, Expediente } from '@/lib/auditoria';

const TIPOS: Record<
  Expediente['tipo'],
  { nombre: string; icono: IconName; enlace?: (id: string) => string }
> = {
  cotizacion: { nombre: 'Cotización', icono: 'cotizaciones', enlace: (id) => `/cotizaciones/${id}` },
  oportunidad: { nombre: 'Oportunidad', icono: 'oportunidades', enlace: (id) => `/oportunidades/${id}` },
  cliente: { nombre: 'Cliente', icono: 'clientes', enlace: (id) => `/clientes/${id}` },
  usuario: { nombre: 'Usuario', icono: 'usuarios' },
};

function Evento({ a, onAbrir, conFecha }: { a: AccionVista; onAbrir: () => void; conFecha: boolean }) {
  return (
    <li>
      <button
        type="button"
        onClick={onAbrir}
        className="flex w-full cursor-pointer items-center gap-3 border-b border-borde px-4 py-2.5 text-left text-[13px] last:border-0 hover:bg-superficie-2"
      >
        <span className="tabular w-[120px] shrink-0 whitespace-nowrap text-texto-suave max-sm:w-auto">
          {conFecha
            ? fechaHoraAuditoria(a.en).replace(/ \d{4},/, '')
            : fechaHoraAuditoria(a.en).split(', ')[1]}
        </span>
        <Persona a={a} tamano={24} />
        <span className="min-w-0 flex-1">
          <Frase a={a} />
        </span>
        <Icon name="derecha" size={16} className="shrink-0 text-texto-suave" />
      </button>
    </li>
  );
}

/** Vista C · Por expediente: un documento a la izquierda y toda su historia a la derecha (por revisión o por día). */
export function VistaExpedientes({
  expedientes,
  seleccion,
  acciones,
  buscar,
}: {
  expedientes: Expediente[];
  seleccion: { tipo: Expediente['tipo']; id: string } | null;
  acciones: AccionVista[];
  buscar: string;
}) {
  const [abierta, setAbierta] = useState<AccionVista | null>(null);
  const actual = seleccion
    ? expedientes.find((e) => e.tipo === seleccion.tipo && e.id === seleccion.id)
    : null;

  // En una cotización, la historia se ordena por revisión (la más reciente arriba).
  const porRevision =
    seleccion?.tipo === 'cotizacion'
      ? [...new Set(acciones.map((a) => a.revisionNumero))]
          .sort((x, y) => (y ?? -1) - (x ?? -1))
          .map((n) => ({
            titulo: n === null ? 'Cotización' : nombreRevision(n),
            items: acciones.filter((a) => a.revisionNumero === n),
          }))
      : null;
  const bloques = porRevision ?? porDia(acciones);

  return (
    <div className="grid lg:grid-cols-[340px_1fr]">
      <div className="border-b border-borde bg-superficie-2/50 p-3 lg:border-r lg:border-b-0">
        <form
          action="/auditoria"
          className="mb-3 flex min-h-10 items-center gap-2 rounded-md border border-borde bg-superficie px-3 text-[13px] focus-within:border-acento"
        >
          <input type="hidden" name="vista" value="expedientes" />
          <Icon name="buscar" size={16} className="text-texto-suave" />
          <input
            type="search"
            name="buscar"
            defaultValue={buscar}
            placeholder="Buscar expediente…"
            autoComplete="off"
            maxLength={100}
            aria-label="Buscar expediente"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-texto-suave"
          />
        </form>
        {expedientes.length === 0 ? (
          <p className="px-3 py-8 text-center text-[13px] text-texto-suave">
            Sin expedientes con esa búsqueda.
          </p>
        ) : (
          <ul className="max-h-[70vh] space-y-1 overflow-y-auto">
            {expedientes.map((e) => {
              const sel = seleccion?.tipo === e.tipo && seleccion.id === e.id;
              const u = new URLSearchParams({ vista: 'expedientes', exp: `${e.tipo}:${e.id}` });
              if (buscar) u.set('buscar', buscar);
              return (
                <li key={`${e.tipo}:${e.id}`}>
                  <Link
                    href={`/auditoria?${u.toString()}`}
                    aria-current={sel ? 'true' : undefined}
                    className={`flex items-center gap-3 rounded-md px-3 py-2.5 ${
                      sel ? 'bg-superficie ring-1 ring-acento sombra' : 'hover:bg-superficie'
                    }`}
                  >
                    <span className="text-texto-suave" title={TIPOS[e.tipo].nombre}>
                      <Icon name={TIPOS[e.tipo].icono} size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{e.titulo}</span>
                      <span className="block truncate text-[12px] text-texto-suave">
                        {[TIPOS[e.tipo].nombre, e.detalle].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="tabular rounded-pill bg-neutro-suave px-2 py-0.5 text-[11.5px] font-semibold text-neutro">
                      {e.eventos}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="min-w-0 p-6">
        {!seleccion ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-texto-suave">
            <Icon name="catalogos" size={32} />
            <p className="mt-3 max-w-sm text-sm">
              Elige una cotización, oportunidad, cliente o usuario para ver toda su historia: quién la creó,
              quién la envió, quién la autorizó, qué cambió y cuándo se emitió.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-bold tracking-wide text-texto-suave uppercase">
                  Expediente {seleccion.tipo === 'usuario' || seleccion.tipo === 'cliente' ? 'del' : 'de la'}{' '}
                  {TIPOS[seleccion.tipo].nombre.toLowerCase()}
                </p>
                <h2 className="text-[19px] font-bold break-words">{actual?.titulo ?? '—'}</h2>
                {actual?.detalle && <p className="text-[13px] text-texto-suave">{actual.detalle}</p>}
              </div>
              {TIPOS[seleccion.tipo].enlace && (
                <Link
                  href={TIPOS[seleccion.tipo].enlace!(seleccion.id)}
                  className={clasesBoton('secundario', 'chico')}
                >
                  <Icon name="abrir" size={16} />
                  Abrir {TIPOS[seleccion.tipo].nombre.toLowerCase()}
                </Link>
              )}
            </div>
            {acciones.length === 0 ? (
              <p className="py-10 text-center text-sm text-texto-suave">Sin registros.</p>
            ) : (
              bloques.map((b) => (
                <section key={b.titulo} className="mb-4 overflow-hidden rounded-lg border border-borde">
                  <div className="flex items-center gap-3 border-b border-borde bg-superficie-2 px-4 py-2.5">
                    <h3 className="text-[14px] font-bold first-letter:uppercase">{b.titulo}</h3>
                    <span className="ml-auto text-[12.5px] text-texto-suave">
                      {b.items.length} {b.items.length === 1 ? 'evento' : 'eventos'}
                    </span>
                  </div>
                  <ul>
                    {b.items.map((a) => (
                      <Evento
                        key={a.clave}
                        a={a}
                        conFecha={Boolean(porRevision)}
                        onAbrir={() => setAbierta(a)}
                      />
                    ))}
                  </ul>
                </section>
              ))
            )}
          </>
        )}
      </div>
      {abierta && (
        <VentanaFlotante titulo="Detalle del cambio" onCerrar={() => setAbierta(null)}>
          <DetalleAccion a={abierta} />
        </VentanaFlotante>
      )}
    </div>
  );
}
