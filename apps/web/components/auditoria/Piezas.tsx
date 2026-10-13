'use client';

import { diferenciaPalabras, fechaHoraAuditoria, type CambioCampo, type TipoAccion } from '@celmi/core';
import Link from 'next/link';
import { useState } from 'react';
import type { AccionVista } from '@/lib/auditoria';
import { Icon, type IconName } from '../Icon';
import { TextoComparado } from '../TextoComparado';
import { Avatar, clasesBoton, Pill, type Tono } from '../ui';

/** Piezas de la auditoría (Fase 7): frase de cada acción, su ícono y el detalle campo por campo. */

export const ICONOS: Record<TipoAccion, IconName> = {
  autorizacion: 'autorizaciones',
  emision: 'abrir',
  cancelacion: 'cerrar',
  cotizacion: 'cotizaciones',
  partidas: 'cotizaciones',
  condiciones: 'mensaje',
  financiamiento: 'columnas',
  oportunidad: 'oportunidades',
  seguimiento: 'mensaje',
  cliente: 'clientes',
  usuario: 'usuarios',
  permisos: 'llave',
  catalogo: 'catalogos',
  otro: 'auditoria',
};

export const FONDOS: Record<Tono, string> = {
  exito: 'bg-exito-suave text-exito',
  info: 'bg-info-suave text-info',
  peligro: 'bg-peligro-suave text-peligro',
  aviso: 'bg-aviso-suave text-aviso',
  neutro: 'bg-neutro-suave text-neutro',
};

const COLORES = ['#29235C', '#0064EC', '#0f8a6a', '#b45309', '#7c3aed', '#be185d', '#0e7490', '#4d7c0f'];

/** Color estable por persona. */
export function colorPersona(id: string | null): string {
  if (!id) return '#6b7280';
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORES[h % COLORES.length]!;
}

export const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0]?.toUpperCase() ?? '')
    .join('') || '·';

export function Persona({
  a,
  tamano = 28,
}: {
  a: Pick<AccionVista, 'usuario' | 'usuarioId'>;
  tamano?: number;
}) {
  return <Avatar iniciales={iniciales(a.usuario)} color={colorPersona(a.usuarioId)} tamano={tamano} />;
}

export function IconoAccion({ a, tamano = 32 }: { a: AccionVista; tamano?: number }) {
  return (
    <span
      className={`relative z-10 inline-flex shrink-0 items-center justify-center rounded-full ring-4 ring-superficie ${FONDOS[a.tono]}`}
      style={{ width: tamano, height: tamano }}
    >
      <Icon name={ICONOS[a.tipo]} size={Math.round(tamano / 2)} />
    </span>
  );
}

/** «Alejandro Bonilla autorizó la Rev A» con la etiqueta «Sensible» si aplica. */
export function Frase({ a, conUsuario = true }: { a: AccionVista; conUsuario?: boolean }) {
  return (
    <>
      {conUsuario && <b>{a.usuario}</b>} {a.verbo}
      {a.objeto && (
        <>
          {' '}
          <b className="text-acento">{a.objeto}</b>
        </>
      )}
      {a.sensible && (
        <span className="ml-2 inline-block align-middle">
          <Pill tono="peligro">Sensible</Pill>
        </span>
      )}
    </>
  );
}

export const textoCambios = (n: number) => (n === 1 ? '1 cambio' : `${n} cambios`);

/** Un campo: lo de antes (rojo, tachado) → lo que quedó (verde); los textos largos, palabra por palabra. */
function Diferencia({ c }: { c: CambioCampo }) {
  if (c.largo && c.antes && c.despues) {
    const d = diferenciaPalabras(c.antes, c.despues);
    return (
      <div className="grid gap-1.5 text-[13px] leading-relaxed">
        <p className="rounded-md bg-superficie-2 px-2.5 py-2 whitespace-pre-line">
          <TextoComparado tramos={d.antes} />
        </p>
        <p className="rounded-md bg-superficie-2 px-2.5 py-2 whitespace-pre-line">
          <TextoComparado tramos={d.despues} />
        </p>
      </div>
    );
  }
  if (c.tipo !== 'modificado') {
    const valor = c.tipo === 'agregado' ? c.despues : c.antes;
    return (
      <p
        className={`rounded-md px-2.5 py-1.5 text-[13px] whitespace-pre-line ${
          c.tipo === 'agregado'
            ? 'bg-exito-suave font-semibold text-exito'
            : 'bg-peligro-suave text-peligro line-through'
        }`}
      >
        {valor ?? (c.tipo === 'agregado' ? 'Agregado' : 'Quitado')}
      </p>
    );
  }
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[13px]">
      <span className="rounded-md bg-peligro-suave px-2.5 py-1.5 whitespace-pre-line text-peligro line-through decoration-1">
        {c.antes ?? '—'}
      </span>
      <Icon name="derecha" size={14} className="text-texto-suave" />
      <span className="rounded-md bg-exito-suave px-2.5 py-1.5 font-semibold whitespace-pre-line text-exito">
        {c.despues ?? '—'}
      </span>
    </div>
  );
}

const VISIBLES = 8;

/** Lista de cambios de una acción, agrupados por lo que tocaron (partida, opción, condición…). */
export function ListaCambios({ cambios }: { cambios: CambioCampo[] }) {
  const [todos, setTodos] = useState(false);
  if (cambios.length === 0)
    return (
      <p className="py-3 text-[13px] text-texto-suave">Esta acción no cambió datos que se muestren aquí.</p>
    );
  const vista = todos ? cambios : cambios.slice(0, VISIBLES);
  return (
    <div>
      {vista.map((c, i) => (
        <div key={i} className="border-b border-borde py-2.5 last:border-0">
          <p className="mb-1 text-[11.5px] font-bold tracking-wide text-texto-suave uppercase">
            {c.campo}
            {c.entidad && <span className="font-semibold normal-case"> · {c.entidad}</span>}
          </p>
          <Diferencia c={c} />
        </div>
      ))}
      {cambios.length > VISIBLES && (
        <button
          type="button"
          onClick={() => setTodos((x) => !x)}
          className="mt-2 cursor-pointer text-[13px] font-semibold text-acento hover:underline"
        >
          {todos ? 'Ver menos' : `Ver ${cambios.length - VISIBLES} cambios más`}
        </button>
      )}
    </div>
  );
}

/** Encabezado y cuerpo del detalle de una acción (panel de la tabla o ventana flotante). */
export function DetalleAccion({ a, enlaces = true }: { a: AccionVista; enlaces?: boolean }) {
  return (
    <div className="flex flex-col">
      <div className="flex items-start gap-3">
        <Persona a={a} tamano={36} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-snug font-bold">
            <Frase a={a} />
          </p>
          <p className="mt-0.5 text-[12.5px] text-texto-suave">{fechaHoraAuditoria(a.en)}</p>
        </div>
      </div>
      {a.contexto && <p className="mt-3 rounded-md bg-superficie-2 px-3 py-2 text-[13px]">{a.contexto}</p>}
      <div className="mt-2">
        <ListaCambios cambios={a.cambios} />
      </div>
      {enlaces && (a.cotizacionId || a.oportunidadId) && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-borde pt-3">
          {a.cotizacionId ? (
            <Link href={`/cotizaciones/${a.cotizacionId}`} className={clasesBoton('secundario', 'chico')}>
              <Icon name="abrir" size={16} />
              Abrir cotización
            </Link>
          ) : (
            <Link href={`/oportunidades/${a.oportunidadId}`} className={clasesBoton('secundario', 'chico')}>
              <Icon name="abrir" size={16} />
              Abrir oportunidad
            </Link>
          )}
          {a.cotizacionId && (
            <Link
              href={`/auditoria?vista=expedientes&exp=cotizacion:${a.cotizacionId}`}
              className={clasesBoton('fantasma', 'chico')}
            >
              <Icon name="reloj" size={16} />
              Todo su expediente
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

const DIA = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const CLAVE_DIA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' });
export const HORA = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Agrupa por día («Hoy · lunes 13 de octubre»). */
export function porDia<T extends { en: string }>(lista: T[]): { titulo: string; items: T[] }[] {
  const hoy = CLAVE_DIA.format(new Date());
  const ayer = CLAVE_DIA.format(new Date(Date.now() - 24 * 3600 * 1000));
  const grupos: { clave: string; titulo: string; items: T[] }[] = [];
  for (const x of lista) {
    const d = new Date(x.en);
    const clave = CLAVE_DIA.format(d);
    let g = grupos.at(-1);
    if (!g || g.clave !== clave) {
      const nombre = DIA.format(d);
      const prefijo = clave === hoy ? 'Hoy · ' : clave === ayer ? 'Ayer · ' : '';
      g = { clave, titulo: `${prefijo}${nombre}`, items: [] };
      grupos.push(g);
    }
    g.items.push(x);
  }
  return grupos;
}
