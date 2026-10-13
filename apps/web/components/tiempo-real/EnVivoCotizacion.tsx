'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '../Icon';
import { Avatar, Boton, type Tono } from '../ui';
import { useTiempoReal } from './Proveedor';

/**
 * Cotización en vivo (Fase 8 · C y D). Canal privado «cotizacion:<id>» (sólo para quien tiene acceso, 0035):
 *  · presencia: quién más la tiene abierta;
 *  · cambios: la base avisa cuando otra persona guarda partidas, condiciones o financiamiento, o cambia el estado.
 * La pantalla nunca se recarga sola (no se pierde lo que se está capturando): la franja ofrece «Actualizar vista».
 */

interface Cambio {
  grupo: 'estado' | 'partidas' | 'condiciones' | 'financiamiento' | 'revision';
  estado?: string;
  anterior?: string;
  usuario?: string;
  nombre?: string | null;
}

const COLORES = ['#29235C', '#0064EC', '#0f8a6a', '#b45309', '#7c3aed', '#be185d'];
const color = (id: string) =>
  COLORES[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0) % COLORES.length]!;
const iniciales = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0]?.toUpperCase() ?? '')
    .join('');
const primerNombre = (n: string | null | undefined) => (n ?? 'Alguien').split(' ')[0];

function describir(c: Cambio): { tono: Tono; icono: IconName; texto: string; editando: boolean } {
  const quien = primerNombre(c.nombre);
  if (c.grupo === 'estado') {
    const verbo =
      c.estado === 'autorizada'
        ? 'autorizó'
        : c.estado === 'rechazada'
          ? 'rechazó'
          : c.estado === 'pendiente_autorizacion'
            ? 'envió a autorización'
            : c.estado === 'emitida'
              ? 'emitió'
              : c.estado === 'borrador' && c.anterior === 'pendiente_autorizacion'
                ? 'retiró para corregir'
                : 'cambió el estado de';
    return {
      tono: c.estado === 'autorizada' ? 'exito' : c.estado === 'rechazada' ? 'peligro' : 'info',
      icono: 'autorizaciones',
      texto: `${quien} ${verbo} esta revisión hace un momento. Lo que ves aún es la versión anterior.`,
      editando: false,
    };
  }
  const que =
    c.grupo === 'partidas'
      ? 'las partidas'
      : c.grupo === 'condiciones'
        ? 'las condiciones comerciales'
        : c.grupo === 'financiamiento'
          ? 'el financiamiento'
          : 'los datos de la cotización';
  return {
    tono: 'aviso',
    icono: 'campana',
    texto: `${quien} guardó cambios en ${que}. Si estás editando, revisa sus cambios antes de guardar para no sobrescribirlos.`,
    editando: true,
  };
}

const sinSuscripcion = () => () => undefined;

export function EnVivoCotizacion({ cotizacionId }: { cotizacionId: string }) {
  const tr = useTiempoReal();
  const router = useRouter();
  const [otros, setOtros] = useState<{ id: string; nombre: string }[]>([]);
  const [cambio, setCambio] = useState<Cambio | null>(null);
  // Lugar de la franja, debajo del encabezado de la cotización.
  const destino = useSyncExternalStore(
    sinSuscripcion,
    () => document.getElementById('franja-en-vivo'),
    () => null,
  );

  const supabase = tr?.supabase;
  const yoId = tr?.usuario.id;
  const yoNombre = tr?.usuario.nombre;
  useEffect(() => {
    if (!supabase || !yoId) return;
    const canal = supabase.channel(`cotizacion:${cotizacionId}`, {
      config: { private: true, presence: { key: yoId } },
    });
    canal
      .on('presence', { event: 'sync' }, () => {
        const estado = canal.presenceState<{ nombre: string }>();
        setOtros(
          Object.entries(estado)
            .filter(([id]) => id !== yoId)
            .map(([id, v]) => ({ id, nombre: v[0]?.nombre ?? 'Alguien' })),
        );
      })
      .on('broadcast', { event: 'cambio' }, ({ payload }) => {
        const c = payload as Cambio;
        if (!c || typeof c.grupo !== 'string' || c.usuario === yoId) return;
        setCambio(c);
      })
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') void canal.track({ nombre: yoNombre ?? '' });
      });
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [supabase, yoId, yoNombre, cotizacionId]);

  const d = cambio ? describir(cambio) : null;
  const FONDO: Record<Tono, string> = {
    exito: 'border-exito/30 bg-exito-suave text-exito',
    info: 'border-info/30 bg-info-suave text-info',
    peligro: 'border-peligro/30 bg-peligro-suave text-peligro',
    aviso: 'border-aviso/30 bg-aviso-suave text-aviso',
    neutro: 'border-borde bg-neutro-suave text-neutro',
  };

  return (
    <>
      {otros.length > 0 && (
        <span
          role="status"
          className="inline-flex items-center gap-2 rounded-pill border border-borde bg-superficie py-1 pr-3 pl-1 text-[12.5px]"
        >
          <span className="flex -space-x-2">
            {otros.slice(0, 3).map((o) => (
              <span key={o.id} className="rounded-full ring-2 ring-superficie" title={o.nombre}>
                <Avatar iniciales={iniciales(o.nombre)} color={color(o.id)} tamano={26} />
              </span>
            ))}
          </span>
          <span>
            {otros.length === 1 ? (
              <>
                <b>{primerNombre(otros[0]!.nombre)}</b> también la está viendo
              </>
            ) : (
              <>
                <b>{primerNombre(otros[0]!.nombre)}</b> y{' '}
                {otros.length === 2 ? <b>{primerNombre(otros[1]!.nombre)}</b> : `${otros.length - 1} más`}{' '}
                también la están viendo
              </>
            )}
          </span>
        </span>
      )}
      {d &&
        destino &&
        createPortal(
          <div
            role="alert"
            className={`animar-entrada mb-4 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-[13px] ${FONDO[d.tono]}`}
          >
            <Icon name={d.icono} size={18} />
            <span className="min-w-[240px] flex-1 text-texto">{d.texto}</span>
            {d.editando && (
              <Boton tamano="chico" variante="fantasma" onClick={() => setCambio(null)}>
                Seguir editando
              </Boton>
            )}
            <Boton
              tamano="chico"
              variante="primario"
              icono="restablecer"
              onClick={() => {
                setCambio(null);
                router.refresh();
              }}
            >
              Actualizar vista
            </Boton>
          </div>,
          destino,
        )}
    </>
  );
}
