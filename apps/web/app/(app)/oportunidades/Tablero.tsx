'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition, type DragEvent } from 'react';
import { AtajoBuscar } from '@/components/AtajoBuscar';
import { Buscador, paraBuscar } from '@/components/Buscador';
import { Icon } from '@/components/Icon';
import { Avatar, Pill, Tarjeta } from '@/components/ui';
import type { Esquema, Estado, OportunidadFila } from '@/lib/datos';
import { usePreferencia } from '@/lib/preferencias';
import { colorAvatar, haceCuanto, iniciales, tonoEstado } from '@/lib/presentacion';
import { cambiarEstado } from './acciones';
import { SelectorEstado } from './SelectorEstado';

type Vista = 'tablero' | 'tabla';

export function Tablero({
  oportunidades: iniciales0,
  estados,
  esquemas,
  usuarioId,
  verTodas,
  editarTodas,
  puedeCrear,
}: {
  oportunidades: OportunidadFila[];
  estados: Estado[];
  esquemas: Esquema[];
  usuarioId: string;
  verTodas: boolean;
  editarTodas: boolean;
  puedeCrear: boolean;
}) {
  const [oportunidades, setOportunidades] = useState(iniciales0);
  const [vistaGuardada, guardarVista] = usePreferencia('celmi-oportunidades-vista');
  const vista: Vista = vistaGuardada === 'tabla' ? 'tabla' : 'tablero';
  const [busqueda, setBusqueda] = useState('');
  const [ejecutivo, setEjecutivo] = useState('todos');
  const [cerradas, setCerradas] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [, iniciar] = useTransition();

  const nombreEsquema = new Map(esquemas.map((e) => [e.id, e.nombre]));
  const abiertos = estados.filter((e) => !e.final);
  const finales = new Set(estados.filter((e) => e.final).map((e) => e.id));
  const puedeMover = (o: OportunidadFila) => editarTodas || o.ejecutivo_id === usuarioId;

  const ejecutivos = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of oportunidades) if (o.ejecutivo) m.set(o.ejecutivo.id, o.ejecutivo.nombre);
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [oportunidades]);

  const filtradas = useMemo(() => {
    const q = paraBuscar(busqueda.trim());
    return oportunidades.filter(
      (o) =>
        (ejecutivo === 'todos' || o.ejecutivo_id === ejecutivo) &&
        (!q || paraBuscar(`${o.nombre} ${o.cliente?.razon_social} ${o.contacto?.nombre}`).includes(q)),
    );
  }, [oportunidades, busqueda, ejecutivo]);

  const actualizarLocal = (id: string, estado: string) =>
    setOportunidades((xs) => xs.map((o) => (o.id === id ? { ...o, estado_id: estado } : o)));

  const mover = (id: string, estado: string) => {
    const o = oportunidades.find((x) => x.id === id);
    if (!o || o.estado_id === estado) return;
    const anterior = o.estado_id;
    actualizarLocal(id, estado);
    setAviso(null);
    iniciar(async () => {
      const r = await cambiarEstado(id, estado);
      if (r.error) {
        actualizarLocal(id, anterior);
        setAviso(r.error);
      }
    });
  };

  const soltar = (estado: string) => (e: DragEvent) => {
    e.preventDefault();
    setSobre(null);
    const id = e.dataTransfer.getData('text/oportunidad');
    if (id) mover(id, estado);
  };

  const conteoCerradas = filtradas.filter((o) => finales.has(o.estado_id)).length;

  return (
    <div className="animar-entrada mx-auto max-w-[1600px]">
      <AtajoBuscar />
      <header className="mb-5 flex flex-wrap items-end gap-4">
        <div className="mr-auto">
          <h1 className="text-[28px] leading-tight font-bold tracking-tight">Oportunidades</h1>
          <p className="mt-1.5 text-sm text-texto-suave">
            {verTodas ? 'Todas las oportunidades del equipo' : 'Tus oportunidades y en las que colaboras'} ·{' '}
            {filtradas.length} de {oportunidades.length}
          </p>
        </div>
        {puedeCrear && (
          <Link
            href="/oportunidades/nueva"
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-acento px-4 text-sm font-semibold text-sobre-acento hover:brightness-110"
          >
            <Icon name="mas" strokeWidth={2.2} /> Nueva oportunidad
          </Link>
        )}
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Buscador
          valor={busqueda}
          onCambio={setBusqueda}
          placeholder="Proyecto, cliente o contacto…"
          etiqueta="Buscar oportunidades"
        />
        {verTodas && ejecutivos.length > 1 && (
          <label className="flex items-center gap-2 text-[13px] font-semibold text-texto-suave">
            Ejecutivo
            <select
              value={ejecutivo}
              onChange={(e) => setEjecutivo(e.target.value)}
              className="h-11 rounded-md border border-borde bg-superficie px-3 text-sm font-medium text-texto"
            >
              <option value="todos">Todos</option>
              {ejecutivos.map(([id, nombre]) => (
                <option key={id} value={id}>
                  {nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        <div
          role="group"
          aria-label="Vista"
          className="ml-auto inline-flex rounded-md border border-borde bg-superficie p-1"
        >
          {(['tablero', 'tabla'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={vista === v}
              onClick={() => guardarVista(v === 'tablero' ? null : v)}
              className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-sm px-3 text-[13px] font-semibold transition-colors ${
                vista === v ? 'bg-paso text-white' : 'text-texto-suave hover:text-texto'
              }`}
            >
              <Icon name={v === 'tablero' ? 'columnas' : 'cotizaciones'} size={16} />
              {v === 'tablero' ? 'Tablero' : 'Tabla'}
            </button>
          ))}
        </div>
      </div>

      {aviso && (
        <p role="alert" className="mb-4 rounded-md bg-peligro-suave px-4 py-3 text-[13px] text-peligro">
          {aviso}
        </p>
      )}

      {oportunidades.length === 0 ? (
        <Tarjeta className="flex flex-col items-center px-6 py-14 text-center">
          <span className="mb-4 inline-flex size-14 items-center justify-center rounded-pill bg-acento-suave text-acento-texto">
            <Icon name="oportunidades" size={26} />
          </span>
          <p className="text-lg font-bold">Aún no hay oportunidades</p>
          <p className="mt-1.5 max-w-md text-sm text-texto-suave">
            Una oportunidad es un proyecto o necesidad de un cliente; de ella salen sus cotizaciones.
          </p>
          {puedeCrear && (
            <Link
              href="/oportunidades/nueva"
              className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-md bg-acento px-4 text-sm font-semibold text-sobre-acento"
            >
              <Icon name="mas" strokeWidth={2.2} /> Crear la primera
            </Link>
          )}
        </Tarjeta>
      ) : vista === 'tablero' ? (
        <>
          <div className="-mx-1 overflow-x-auto px-1 pb-3">
            <div className="flex min-w-max gap-3">
              {abiertos.map((estado) => {
                const tarjetas = filtradas.filter((o) => o.estado_id === estado.id);
                return (
                  <section
                    key={estado.id}
                    aria-label={estado.nombre}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setSobre(estado.id);
                    }}
                    onDragLeave={() => setSobre((s) => (s === estado.id ? null : s))}
                    onDrop={soltar(estado.id)}
                    className={`flex w-[272px] shrink-0 flex-col rounded-lg border p-2.5 transition-colors ${
                      sobre === estado.id
                        ? 'border-acento bg-acento-suave/60'
                        : 'border-transparent bg-superficie-2'
                    }`}
                  >
                    <div className="mb-2.5 flex items-center justify-between px-1.5 pt-1">
                      <Pill tono={tonoEstado(estado.id)}>{estado.nombre}</Pill>
                      <span className="tabular text-xs font-semibold text-texto-suave">
                        {tarjetas.length}
                      </span>
                    </div>
                    <div className="flex min-h-24 flex-col gap-2">
                      {tarjetas.map((o) => (
                        <TarjetaOportunidad
                          key={o.id}
                          o={o}
                          esquema={o.esquema_id ? nombreEsquema.get(o.esquema_id) : undefined}
                          arrastrable={puedeMover(o)}
                          mostrarEjecutivo={verTodas}
                        />
                      ))}
                      {tarjetas.length === 0 && (
                        <p className="px-2 py-6 text-center text-xs text-texto-suave">Arrastra aquí</p>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setCerradas((v) => !v)}
              aria-expanded={cerradas}
              className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] font-semibold text-texto-suave hover:text-texto"
            >
              <Icon name={cerradas ? 'compactar' : 'expandir'} size={16} className="rotate-90" />
              Cerradas (ganadas, perdidas, abandonadas, canceladas) · {conteoCerradas}
            </button>
            {cerradas && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {filtradas
                  .filter((o) => finales.has(o.estado_id))
                  .map((o) => (
                    <TarjetaOportunidad
                      key={o.id}
                      o={o}
                      esquema={o.esquema_id ? nombreEsquema.get(o.esquema_id) : undefined}
                      arrastrable={puedeMover(o)}
                      mostrarEjecutivo={verTodas}
                      estado={estados.find((e) => e.id === o.estado_id)}
                    />
                  ))}
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-texto-suave">
            Arrastra una tarjeta a otra columna para cambiar su estado, o cámbialo desde la tabla o la ficha.
          </p>
        </>
      ) : (
        <Tarjeta className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead>
                <tr className="bg-superficie-2 text-left text-xs font-semibold text-texto-suave">
                  {[
                    'Oportunidad',
                    'Cliente',
                    'Esquema',
                    ...(verTodas ? ['Ejecutivo'] : []),
                    'Estado',
                    'Actividad',
                  ].map((t) => (
                    <th key={t} scope="col" className="border-b border-borde px-4 py-2.5">
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtradas.map((o) => (
                  <tr
                    key={o.id}
                    className="border-b border-borde transition-[background-color] last:border-0 hover:bg-superficie-2"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/oportunidades/${o.id}`}
                        className="font-semibold hover:text-acento-texto hover:underline"
                      >
                        {o.nombre}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-texto-suave">{o.cliente?.razon_social}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-texto-suave">
                      {o.esquema_id ? nombreEsquema.get(o.esquema_id) : '—'}
                    </td>
                    {verTodas && <td className="px-4 py-3 whitespace-nowrap">{o.ejecutivo?.nombre}</td>}
                    <td className="px-4 py-3">
                      <SelectorEstado
                        oportunidadId={o.id}
                        estadoId={o.estado_id}
                        estados={estados}
                        puedeCambiar={puedeMover(o)}
                        compacto
                        onCambio={(nuevo, error) => {
                          actualizarLocal(o.id, nuevo);
                          setAviso(error ?? null);
                        }}
                      />
                    </td>
                    <td className="px-4 py-3 text-[13px] whitespace-nowrap text-texto-suave">
                      {haceCuanto(o.actualizado_en)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      )}
    </div>
  );
}

function TarjetaOportunidad({
  o,
  esquema,
  arrastrable,
  mostrarEjecutivo,
  estado,
}: {
  o: OportunidadFila;
  esquema?: string;
  arrastrable: boolean;
  mostrarEjecutivo: boolean;
  estado?: Estado;
}) {
  return (
    <Link
      href={`/oportunidades/${o.id}`}
      draggable={arrastrable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/oportunidad', o.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className={`group block rounded-md border border-borde bg-superficie p-3.5 sombra transition-[border-color,transform] hover:-translate-y-0.5 hover:border-acento/50 ${
        arrastrable ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
    >
      <div className="text-[13px] font-semibold text-texto-suave">{o.cliente?.razon_social}</div>
      <div className="mt-0.5 leading-snug font-bold group-hover:text-acento-texto">{o.nombre}</div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {estado && <Pill tono={tonoEstado(estado.id)}>{estado.nombre}</Pill>}
        {esquema && (
          <span className="rounded-pill bg-neutro-suave px-2 py-0.5 text-[11px] font-semibold text-neutro">
            {esquema}
          </span>
        )}
      </div>
      <div className="mt-2.5 flex items-center gap-2 text-xs text-texto-suave">
        {mostrarEjecutivo && o.ejecutivo && (
          <>
            <Avatar
              iniciales={iniciales(o.ejecutivo.nombre)}
              color={colorAvatar(o.ejecutivo.nombre)}
              tamano={20}
            />
            <span className="truncate">{o.ejecutivo.nombre.split(' ')[0]}</span>
            <span aria-hidden="true">·</span>
          </>
        )}
        <span className="whitespace-nowrap">{haceCuanto(o.actualizado_en)}</span>
      </div>
    </Link>
  );
}
