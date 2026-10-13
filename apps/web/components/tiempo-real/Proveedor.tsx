'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { avisosRecientes, contarAutorizacionesEnVivo, guardarMisAvisos } from '@/lib/acciones-avisos';
import { quiereAviso, type PreferenciasAvisos } from '@/lib/avisos';
import type { Notificacion } from '@/lib/datos';
import { clienteNavegador } from '@/lib/supabase/navegador';
import { Emergentes, type Emergente } from './Emergentes';
import { sonarAviso, prepararSonido } from './sonido';

/**
 * Tiempo real (Fase 8, 2026-10-13). Una conexión por pestaña a canales PRIVADOS de Supabase Realtime (las reglas de
 * la base, 0035, deciden quién escucha qué): «avisos:<mi id>» para la campana y los avisos emergentes y, para quien
 * autoriza, «autorizaciones» para la bandeja y su contador. Las cotizaciones abren su propio canal (EnVivoCotizacion).
 */

export type EstadoConexion = 'conectando' | 'en_vivo' | 'reconectando';

interface Contexto {
  usuario: { id: string; nombre: string };
  supabase: SupabaseClient;
  estado: EstadoConexion;
  avisos: Notificacion[];
  marcarLeidos: (ids?: string[]) => void;
  contadorAutorizaciones: number | null;
  preferencias: PreferenciasAvisos;
  cambiarPreferencias: (c: Partial<PreferenciasAvisos>) => Promise<string | null>;
}

const Ctx = createContext<Contexto | null>(null);
export const useTiempoReal = () => useContext(Ctx);

const ICONO_TIPO: Record<string, Emergente['tono']> = {
  revision_autorizada: 'exito',
  revision_enviada: 'info',
  revision_emitida: 'info',
  colaborador_agregado: 'info',
  revision_rechazada: 'peligro',
  cancelacion_solicitada: 'peligro',
  revision_retirada: 'aviso',
  cancelacion_resuelta: 'aviso',
};

const esAviso = (x: unknown): x is Notificacion =>
  !!x &&
  typeof x === 'object' &&
  typeof (x as Notificacion).id === 'string' &&
  typeof (x as Notificacion).titulo === 'string' &&
  typeof (x as Notificacion).tipo === 'string';

export function ProveedorTiempoReal({
  usuario,
  autoriza,
  avisosIniciales,
  contadorInicial,
  preferenciasIniciales,
  children,
}: {
  usuario: { id: string; nombre: string };
  autoriza: boolean;
  avisosIniciales: Notificacion[];
  contadorInicial: number;
  preferenciasIniciales: PreferenciasAvisos;
  children: ReactNode;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const supabase = useMemo(() => clienteNavegador(), []);
  const [estado, setEstado] = useState<EstadoConexion>('conectando');
  const [avisos, setAvisos] = useState(avisosIniciales);
  const [contador, setContador] = useState<number | null>(autoriza ? contadorInicial : null);
  const [preferencias, setPreferencias] = useState(preferenciasIniciales);
  const [emergentes, setEmergentes] = useState<Emergente[]>([]);

  // Lo que cambia sin reconectar los canales.
  const prefs = useRef(preferencias);
  const rutaActual = useRef(ruta);
  useEffect(() => {
    prefs.current = preferencias;
    rutaActual.current = ruta;
  }, [preferencias, ruta]);

  // Los datos del servidor (al navegar) mandan sobre lo que llegó en vivo.
  const [delServidor, setDelServidor] = useState({ avisosIniciales, contadorInicial });
  if (delServidor.avisosIniciales !== avisosIniciales || delServidor.contadorInicial !== contadorInicial) {
    setDelServidor({ avisosIniciales, contadorInicial });
    setAvisos(avisosIniciales);
    if (autoriza) setContador(contadorInicial);
  }

  useEffect(() => prepararSonido(), []);

  const recibir = useCallback(
    (a: Notificacion) => {
      setAvisos((v) => (v.some((x) => x.id === a.id) ? v : [{ ...a, leida_en: null }, ...v].slice(0, 30)));
      const p = prefs.current;
      if (!quiereAviso(a.tipo, p)) return;
      setEmergentes((v) =>
        [
          {
            id: a.id,
            titulo: a.titulo,
            cuerpo: a.cuerpo,
            enlace: a.enlace,
            tono: ICONO_TIPO[a.tipo] ?? 'info',
          },
          ...v,
        ].slice(0, 3),
      );
      if (p.sonido) sonarAviso();
      if (
        p.windows &&
        document.visibilityState === 'hidden' &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ) {
        // Misma etiqueta que el aviso del service worker: Windows muestra uno solo.
        const n = new Notification(a.titulo, { body: a.cuerpo, tag: `aviso-${a.id}`, silent: !p.sonido });
        n.onclick = () => {
          window.focus();
          router.push(a.enlace || '/');
          n.close();
        };
      }
      if (autoriza && (a.tipo === 'revision_enviada' || a.tipo === 'cancelacion_solicitada'))
        void contarAutorizacionesEnVivo().then((n) => n !== null && setContador(n));
    },
    [autoriza, router],
  );

  useEffect(() => {
    let vivo = true;
    let conectadoAntes = false;
    const canales: ReturnType<SupabaseClient['channel']>[] = [];
    void (async () => {
      await supabase.realtime.setAuth();
      if (!vivo) return;
      const avisosCanal = supabase
        .channel(`avisos:${usuario.id}`, { config: { private: true } })
        .on('broadcast', { event: 'aviso' }, ({ payload }) => {
          if (esAviso(payload)) recibir(payload);
        })
        .subscribe((s) => {
          if (s === 'SUBSCRIBED') {
            setEstado('en_vivo');
            // Al reconectar se recupera lo que pudo llegar mientras no había conexión.
            if (conectadoAntes)
              void avisosRecientes().then((r) => {
                if (r) setAvisos(r);
              });
            conectadoAntes = true;
          } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') setEstado('reconectando');
        });
      canales.push(avisosCanal);
      if (autoriza) {
        canales.push(
          supabase
            .channel('autorizaciones', { config: { private: true } })
            .on('broadcast', { event: 'bandeja' }, () => {
              void contarAutorizacionesEnVivo().then((n) => n !== null && setContador(n));
              if (rutaActual.current.startsWith('/autorizaciones')) router.refresh();
            })
            .subscribe(),
        );
      }
    })();
    return () => {
      vivo = false;
      for (const c of canales) void supabase.removeChannel(c);
    };
  }, [supabase, usuario.id, autoriza, recibir, router]);

  const marcarLeidos = useCallback((ids?: string[]) => {
    const ahora = new Date().toISOString();
    setAvisos((v) =>
      v.map((a) => (!a.leida_en && (!ids || ids.includes(a.id)) ? { ...a, leida_en: ahora } : a)),
    );
  }, []);

  const cambiarPreferencias = useCallback(async (c: Partial<PreferenciasAvisos>) => {
    setPreferencias((p) => ({ ...p, ...c }));
    const r = await guardarMisAvisos(c);
    if (r.preferencias) setPreferencias(r.preferencias);
    return r.error ?? null;
  }, []);

  const valor = useMemo<Contexto>(
    () => ({
      usuario,
      supabase,
      estado,
      avisos,
      marcarLeidos,
      contadorAutorizaciones: contador,
      preferencias,
      cambiarPreferencias,
    }),
    [usuario, supabase, estado, avisos, marcarLeidos, contador, preferencias, cambiarPreferencias],
  );

  return (
    <Ctx.Provider value={valor}>
      {children}
      <Emergentes lista={emergentes} onCerrar={(id) => setEmergentes((v) => v.filter((x) => x.id !== id))} />
    </Ctx.Provider>
  );
}
