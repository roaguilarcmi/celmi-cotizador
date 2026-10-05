'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { proximosAvisos, type Aviso } from '@/lib/acciones-tareas';

const REVISAR_CADA = 5 * 60_000;
/** Avisos que se perdieron con la app cerrada se muestran al abrirla, si no tienen más de 12 h. */
const VENTANA_ATRASADOS = 12 * 3_600_000;
const hora = new Intl.DateTimeFormat('es-MX', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Mexico_City',
});

const clave = (a: Aviso) => `celmi-aviso-${a.id}-${a.avisoEn}`;
function yaMostrado(a: Aviso): boolean {
  try {
    return localStorage.getItem(clave(a)) !== null;
  } catch {
    return false;
  }
}
function marcarMostrado(a: Aviso) {
  try {
    localStorage.setItem(clave(a), String(Date.now()));
  } catch {
    // Sin almacenamiento: puede repetirse en otra pestaña; no es grave.
  }
}

/**
 * Programa los avisos de tareas mientras la aplicación está abierta: notificación del sistema (si hay permiso)
 * y tarjeta dentro de la página. Sin servidor de envío: las notificaciones push llegarán con la app Android o
 * cuando la web se publique.
 */
export function AvisosTareas() {
  const router = useRouter();
  const [visibles, setVisibles] = useState<Aviso[]>([]);
  const temporizadores = useRef(new Map<string, number>());

  const disparar = useCallback(
    (a: Aviso) => {
      if (yaMostrado(a)) return;
      marcarMostrado(a);
      setVisibles((v) => (v.some((x) => x.id === a.id) ? v : [...v, a]));
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const n = new Notification(a.titulo, {
          body: `${a.oportunidad ? `${a.oportunidad} · ` : ''}vence ${hora.format(new Date(a.venceEn))}`,
          tag: clave(a),
          icon: '/logo-celmi-color.svg',
        });
        n.onclick = () => {
          window.focus();
          router.push(a.oportunidadId ? `/oportunidades/${a.oportunidadId}` : '/tareas');
          n.close();
        };
      }
    },
    [router],
  );

  const sincronizar = useCallback(async () => {
    let avisos: Aviso[];
    try {
      avisos = await proximosAvisos();
    } catch {
      return; // Sin conexión o sesión vencida: se reintenta en la próxima revisión.
    }
    const ahora = Date.now();
    for (const t of temporizadores.current.values()) window.clearTimeout(t);
    temporizadores.current.clear();
    for (const a of avisos) {
      const cuando = new Date(a.avisoEn).getTime();
      if (cuando <= ahora) {
        if (ahora - cuando <= VENTANA_ATRASADOS) disparar(a);
      } else if (cuando - ahora <= REVISAR_CADA * 2) {
        temporizadores.current.set(
          a.id,
          window.setTimeout(() => disparar(a), cuando - ahora),
        );
      }
    }
  }, [disparar]);

  useEffect(() => {
    // La primera revisión, justo después de pintar la página.
    const inicial = window.setTimeout(() => void sincronizar(), 0);
    const intervalo = window.setInterval(() => void sincronizar(), REVISAR_CADA);
    const alVolver = () => {
      if (document.visibilityState === 'visible') void sincronizar();
    };
    document.addEventListener('visibilitychange', alVolver);
    const temporizadoresActuales = temporizadores.current;
    return () => {
      window.clearTimeout(inicial);
      window.clearInterval(intervalo);
      document.removeEventListener('visibilitychange', alVolver);
      for (const t of temporizadoresActuales.values()) window.clearTimeout(t);
    };
  }, [sincronizar]);

  if (visibles.length === 0) return null;
  return (
    <div
      aria-live="polite"
      className="fixed right-4 bottom-4 z-50 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2"
    >
      {visibles.map((a) => (
        <div
          key={a.id}
          role="status"
          className="animar-entrada flex gap-3 rounded-lg border border-aviso/40 bg-superficie p-4 sombra"
        >
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-aviso-suave text-aviso">
            <Icon name="campana" size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold">{a.titulo}</div>
            <div className="mt-0.5 text-xs text-texto-suave">
              {a.oportunidad && `${a.oportunidad} · `}vence {hora.format(new Date(a.venceEn))}
            </div>
            <button
              type="button"
              onClick={() => {
                setVisibles((v) => v.filter((x) => x.id !== a.id));
                router.push(a.oportunidadId ? `/oportunidades/${a.oportunidadId}` : '/tareas');
              }}
              className="mt-2 cursor-pointer text-xs font-semibold text-acento-texto hover:underline"
            >
              Ver oportunidad
            </button>
          </div>
          <button
            type="button"
            aria-label="Cerrar aviso"
            onClick={() => setVisibles((v) => v.filter((x) => x.id !== a.id))}
            className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-texto-suave hover:bg-superficie-2"
          >
            <Icon name="cerrar" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
