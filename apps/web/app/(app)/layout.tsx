import { after } from 'next/server';
import type { ReactNode } from 'react';
import { CierrePorInactividad } from '@/components/CierrePorInactividad';
import { MenuLateral } from '@/components/MenuLateral';
import { ProveedorTiempoReal } from '@/components/tiempo-real/Proveedor';
import { AvisosTareas } from '@/components/tareas/AvisosTareas';
import { EtapasTareas } from '@/components/tareas/EtapasContexto';
import { contarPorAutorizar, listarMisEtapas, listarNotificaciones } from '@/lib/datos';
import { AVISOS_POR_OMISION, leerPreferenciasAvisos } from '@/lib/avisos';
import { despacharAvisosPush } from '@/lib/push/enviar';
import { obtenerSesion } from '@/lib/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';
import { ESTADOS_ABIERTOS } from '@/lib/etapas-tareas';

/** Tareas pendientes vencidas o que vencen en las próximas 24 h (para el contador del menú). */
async function tareasPorVencer(): Promise<number> {
  const supabase = await clienteServidor();
  const { count } = await supabase
    .from('tareas')
    .select('id', { count: 'exact', head: true })
    .in('estado', ESTADOS_ABIERTOS)
    .is('tarea_padre_id', null)
    .lte('vence_en', new Date(Date.now() + 86_400_000).toISOString());
  return count ?? 0;
}

/** Preferencias de avisos del propio perfil (0035), con sus valores por omisión. */
async function misPreferenciasDeAvisos(id: string) {
  const supabase = await clienteServidor();
  const { data } = await supabase.from('perfiles').select('preferencias').eq('id', id).maybeSingle();
  return leerPreferenciasAvisos((data as { preferencias: unknown } | null)?.preferencias);
}

export default async function LayoutApp({ children }: { children: ReactNode }) {
  const sesion = await obtenerSesion();
  const iniciales = sesion.nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  const [porVencer, etapas, porAutorizar, notificaciones, preferencias] = sesion.demo
    ? [0, [], 0, [], AVISOS_POR_OMISION]
    : await Promise.all([
        tareasPorVencer(),
        listarMisEtapas(),
        sesion.permisos.has('utilidad.autorizar') ? contarPorAutorizar() : 0,
        listarNotificaciones(),
        misPreferenciasDeAvisos(sesion.usuarioId),
      ]);
  // Avisos de Windows con el sitio cerrado (Fase 8): se envían después de responder, sin demorar la página.
  if (!sesion.demo) after(() => despacharAvisosPush());
  const autoriza = sesion.permisos.has('utilidad.autorizar');

  const contenido = (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <MenuLateral
        usuario={{ nombre: sesion.nombre, rol: sesion.rol, iniciales }}
        permisos={[...sesion.permisos]}
        demo={sesion.demo}
        contadores={{ tareas: porVencer, autorizaciones: porAutorizar }}
        notificaciones={notificaciones}
      />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-9 lg:py-7">
        {sesion.demo && (
          <p className="mx-auto mb-4 max-w-[1600px] rounded-md border border-aviso/30 bg-aviso-suave px-4 py-2.5 text-[13px] text-aviso">
            <strong>Modo demostración:</strong> Supabase aún no está configurado en este equipo; se muestran
            datos de muestra y no se pide inicio de sesión.
          </p>
        )}
        <EtapasTareas etapas={etapas}>{children}</EtapasTareas>
      </main>
      {!sesion.demo && (
        <>
          <CierrePorInactividad />
          <AvisosTareas />
        </>
      )}
    </div>
  );
  if (sesion.demo) return contenido;
  return (
    <ProveedorTiempoReal
      usuario={{ id: sesion.usuarioId, nombre: sesion.nombre }}
      autoriza={autoriza}
      avisosIniciales={notificaciones}
      contadorInicial={porAutorizar}
      preferenciasIniciales={preferencias}
    >
      {contenido}
    </ProveedorTiempoReal>
  );
}
