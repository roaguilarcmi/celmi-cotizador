'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Icon } from '@/components/Icon';
import { cambiarEstadoTarea } from '@/lib/acciones-tareas';
import type { TareaFila } from '@/lib/datos';

const zona = 'America/Mexico_City';
const fmt = (f: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-MX', { ...f, timeZone: zona });
const hora = fmt({ hour: '2-digit', minute: '2-digit' });
const fechaCorta = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
const dia = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' });

/** «Vencida», «Hoy 16:00», «Mañana 10:00» o «jue 8 oct 10:00», con su tono. */
export function cuando(venceEn: string): { texto: string; tono: 'peligro' | 'aviso' | 'neutro' } {
  const v = new Date(venceEn);
  const hoy = dia.format(new Date());
  const manana = dia.format(new Date(Date.now() + 86_400_000));
  const d = dia.format(v);
  if (v.getTime() < Date.now())
    return { texto: `Venció ${d === hoy ? `hoy ${hora.format(v)}` : fechaCorta.format(v)}`, tono: 'peligro' };
  if (d === hoy) return { texto: `Hoy ${hora.format(v)}`, tono: 'aviso' };
  if (d === manana) return { texto: `Mañana ${hora.format(v)}`, tono: 'neutro' };
  return { texto: `${fechaCorta.format(v)} ${hora.format(v)}`, tono: 'neutro' };
}

const TONOS = {
  peligro: 'bg-peligro-suave text-peligro',
  aviso: 'bg-aviso-suave text-aviso',
  neutro: 'bg-neutro-suave text-neutro',
};

export function ListaTareas({
  tareas,
  mostrarOportunidad,
  vacio = 'Sin tareas pendientes.',
}: {
  tareas: TareaFila[];
  mostrarOportunidad?: boolean;
  vacio?: string;
}) {
  const [verCerradas, setVerCerradas] = useState(false);
  const pendientes = tareas.filter((t) => t.estado === 'pendiente');
  const cerradas = tareas.filter((t) => t.estado !== 'pendiente');

  return (
    <div>
      {pendientes.length === 0 ? (
        <p className="py-3 text-[13px] text-texto-suave">{vacio}</p>
      ) : (
        <ul className="flex flex-col">
          {pendientes.map((t) => (
            <FilaTarea key={t.id} t={t} mostrarOportunidad={mostrarOportunidad} />
          ))}
        </ul>
      )}
      {cerradas.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setVerCerradas((v) => !v)}
            aria-expanded={verCerradas}
            className="min-h-9 cursor-pointer text-[13px] font-semibold text-texto-suave hover:text-texto"
          >
            {verCerradas ? 'Ocultar' : 'Ver'} completadas y canceladas ({cerradas.length})
          </button>
          {verCerradas && (
            <ul className="mt-1 flex flex-col opacity-75">
              {cerradas.map((t) => (
                <FilaTarea key={t.id} t={t} mostrarOportunidad={mostrarOportunidad} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function FilaTarea({ t, mostrarOportunidad }: { t: TareaFila; mostrarOportunidad?: boolean }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const hecha = t.estado === 'completada';
  const cancelada = t.estado === 'cancelada';
  const c = cuando(t.vence_en);

  const cambiar = (estado: 'pendiente' | 'completada' | 'cancelada') =>
    iniciar(async () => {
      const r = await cambiarEstadoTarea(t.id, estado);
      setError(r.error ?? null);
    });

  return (
    <li className="flex items-start gap-3 border-b border-borde py-3 last:border-0">
      <button
        type="button"
        role="checkbox"
        aria-checked={hecha}
        aria-label={hecha ? `Reabrir «${t.titulo}»` : `Marcar «${t.titulo}» como completada`}
        disabled={pendiente || cancelada}
        onClick={() => cambiar(hecha ? 'pendiente' : 'completada')}
        className={`mt-0.5 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 transition-colors disabled:cursor-not-allowed ${
          hecha ? 'border-exito bg-exito text-white' : 'border-borde hover:border-exito'
        }`}
      >
        {hecha && <Icon name="palomita" size={14} strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-semibold ${hecha || cancelada ? 'text-texto-suave line-through' : ''}`}>
          {t.titulo}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-texto-suave">
          {!hecha && !cancelada && (
            <span className={`rounded-pill px-2 py-0.5 font-semibold ${TONOS[c.tono]}`}>{c.texto}</span>
          )}
          {cancelada && <span>Cancelada</span>}
          {hecha && t.completada_en && <span>Completada</span>}
          {t.aviso_en && !hecha && !cancelada && (
            <span className="inline-flex items-center gap-1" title="Con aviso programado">
              <Icon name="campana" size={13} /> {hora.format(new Date(t.aviso_en))}
            </span>
          )}
          {mostrarOportunidad && t.oportunidad && (
            <Link
              href={`/oportunidades/${t.oportunidad.id}`}
              className="font-semibold text-acento-texto hover:underline"
            >
              {t.oportunidad.cliente?.razon_social ? `${t.oportunidad.cliente.razon_social} · ` : ''}
              {t.oportunidad.nombre}
            </Link>
          )}
        </div>
        {error && <p className="mt-1 text-xs text-peligro">{error}</p>}
      </div>
      {!hecha && !cancelada && (
        <button
          type="button"
          onClick={() => cambiar('cancelada')}
          disabled={pendiente}
          aria-label={`Cancelar «${t.titulo}»`}
          title="Cancelar tarea"
          className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-texto-suave hover:bg-superficie-2 hover:text-peligro"
        >
          <Icon name="cerrar" size={16} />
        </button>
      )}
      {cancelada && (
        <button
          type="button"
          onClick={() => cambiar('pendiente')}
          disabled={pendiente}
          className="min-h-9 shrink-0 cursor-pointer rounded-md px-2 text-xs font-semibold text-acento-texto hover:bg-acento-suave"
        >
          Reabrir
        </button>
      )}
    </li>
  );
}
