'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { quitarSuscripcion, registrarSuscripcion } from '@/lib/acciones-avisos';
import type { PreferenciasAvisos } from '@/lib/avisos';
import { Boton } from '../ui';
import { useTiempoReal, type EstadoConexion } from './Proveedor';
import { sonarAviso } from './sonido';

const CLAVE_VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function Interruptor({
  activo,
  onCambiar,
  deshabilitado,
  titulo,
  detalle,
}: {
  activo: boolean;
  onCambiar: (v: boolean) => void;
  deshabilitado?: boolean;
  titulo: string;
  detalle: ReactNode;
}) {
  return (
    <label
      className={`flex items-center gap-4 border-b border-borde py-3 last:border-0 ${deshabilitado ? 'opacity-60' : 'cursor-pointer'}`}
    >
      <span className="flex-1">
        <span className="block text-[13.5px] font-semibold">{titulo}</span>
        <span className="block text-[12px] text-texto-suave">{detalle}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={activo}
        disabled={deshabilitado}
        onChange={(e) => onCambiar(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={`relative h-6 w-11 shrink-0 rounded-pill transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-acento peer-focus-visible:ring-offset-2 ${activo ? 'bg-acento' : 'bg-borde'}`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] ${activo ? 'left-[22px]' : 'left-0.5'}`}
        />
      </span>
    </label>
  );
}

const B64 = (b: ArrayBuffer | null) =>
  b
    ? btoa(String.fromCharCode(...new Uint8Array(b)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
    : '';

function claveServidor(): Uint8Array<ArrayBuffer> {
  const b = atob(
    CLAVE_VAPID.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (CLAVE_VAPID.length % 4)) % 4),
  );
  const r = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) r[i] = b.charCodeAt(i);
  return r;
}

const soportaPush = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  typeof Notification !== 'undefined';

/** «Avisos de Windows aunque el cotizador esté cerrado» (Web Push) en este navegador. */
function usePushEnEsteEquipo() {
  const [activo, setActivo] = useState<boolean | null>(null);
  useEffect(() => {
    if (!soportaPush()) return;
    void navigator.serviceWorker
      .getRegistration('/')
      .then((r) => r?.pushManager.getSubscription())
      .then((s) => setActivo(Boolean(s)))
      .catch(() => setActivo(false));
  }, []);

  const cambiar = async (encender: boolean): Promise<string | null> => {
    if (!soportaPush()) return 'Este navegador no permite avisos con el sitio cerrado.';
    if (encender) {
      if (!CLAVE_VAPID) return 'Falta configurar los avisos de Windows en el servidor.';
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted')
        return 'Windows no dio permiso. Actívalo en el candado de la barra de direcciones → Notificaciones → Permitir.';
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveServidor() }));
      const r = await registrarSuscripcion({
        endpoint: sub.endpoint,
        p256dh: B64(sub.getKey('p256dh')),
        auth: B64(sub.getKey('auth')),
      });
      if (r.error) {
        await sub.unsubscribe();
        return r.error;
      }
      setActivo(true);
      return null;
    }
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await quitarSuscripcion(sub.endpoint);
      await sub.unsubscribe();
    }
    setActivo(false);
    return null;
  };
  return { activo, cambiar, soportado: soportaPush() };
}

const ESTADOS: Record<EstadoConexion, string> = {
  conectando: 'Conectando…',
  en_vivo: 'En vivo: los avisos llegan al instante.',
  reconectando: 'Reconectando… (los avisos llegarán en cuanto vuelva la conexión).',
};

/** Contenido de la ventana «Mis avisos» (Fase 8 · E). */
export function MisAvisos({ autoriza }: { autoriza: boolean }) {
  const tr = useTiempoReal();
  const push = usePushEnEsteEquipo();
  const [error, setError] = useState<string | null>(null);
  const [permiso, setPermiso] = useState<NotificationPermission | 'no'>(() =>
    typeof Notification === 'undefined' ? 'no' : Notification.permission,
  );
  if (!tr) return null;
  const p = tr.preferencias;
  const cambiar = (c: Partial<PreferenciasAvisos>) => void tr.cambiarPreferencias(c).then((e) => setError(e));

  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-[12.5px] text-texto-suave">
        <span className={`size-2 rounded-full ${tr.estado === 'en_vivo' ? 'bg-exito' : 'bg-aviso'}`} />
        {ESTADOS[tr.estado]}
      </p>
      <Interruptor
        activo={p.cotizaciones}
        onCambiar={(v) => cambiar({ cotizaciones: v })}
        titulo="Cotizaciones en las que participo"
        detalle="Autorizada, rechazada, retirada para corregir, emitida, cancelación resuelta y cuando te agregan a una oportunidad."
      />
      {autoriza && (
        <Interruptor
          activo={p.autorizacion}
          onCambiar={(v) => cambiar({ autorizacion: v })}
          titulo="Solicitudes de autorización y de cancelación"
          detalle="Para quien autoriza."
        />
      )}
      <Interruptor
        activo={p.sonido}
        onCambiar={(v) => {
          cambiar({ sonido: v });
          if (v) sonarAviso();
        }}
        titulo="Sonido"
        detalle="Un tono breve al llegar un aviso."
      />
      <Interruptor
        activo={p.windows && permiso === 'granted'}
        deshabilitado={permiso === 'no' || permiso === 'denied'}
        onCambiar={(v) => {
          if (v && permiso !== 'granted')
            void Notification.requestPermission().then((r) => {
              setPermiso(r);
              if (r === 'granted') cambiar({ windows: true });
            });
          else cambiar({ windows: v });
        }}
        titulo="Notificaciones de Windows con el cotizador abierto"
        detalle={
          permiso === 'denied'
            ? 'Bloqueadas en este navegador: candado de la barra de direcciones → Notificaciones → Permitir.'
            : 'Cuando el cotizador está abierto pero en otra pestaña o minimizado.'
        }
      />
      <Interruptor
        activo={Boolean(push.activo)}
        deshabilitado={!push.soportado || push.activo === null}
        onCambiar={(v) =>
          void push
            .cambiar(v)
            .then((e) => {
              setError(e);
              if (typeof Notification !== 'undefined') setPermiso(Notification.permission);
            })
            .catch(() => setError('No se pudo cambiar. Intenta de nuevo.'))
        }
        titulo="Avisos de Windows aunque el cotizador esté cerrado"
        detalle="Sólo en este equipo. Por seguridad muestran un título genérico («Se autorizó una cotización»), sin clientes, folios ni montos."
      />
      {error && (
        <p className="mt-3 rounded-md bg-peligro-suave px-3 py-2 text-[13px] text-peligro">{error}</p>
      )}
      <div className="mt-4 flex justify-end">
        <Boton tamano="chico" variante="fantasma" onClick={() => sonarAviso()}>
          Probar sonido
        </Boton>
      </div>
    </div>
  );
}
