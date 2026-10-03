import type { ReactNode } from 'react';
import { CierrePorInactividad } from '@/components/CierrePorInactividad';
import { MenuLateral } from '@/components/MenuLateral';
import { obtenerSesion } from '@/lib/sesion';

export default async function LayoutApp({ children }: { children: ReactNode }) {
  const sesion = await obtenerSesion();
  const iniciales = sesion.nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <MenuLateral
        usuario={{ nombre: sesion.nombre, rol: sesion.rol, iniciales }}
        permisos={[...sesion.permisos]}
        demo={sesion.demo}
      />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-9 lg:py-7">
        {sesion.demo && (
          <p className="mx-auto mb-4 max-w-[1600px] rounded-md border border-aviso/30 bg-aviso-suave px-4 py-2.5 text-[13px] text-aviso">
            <strong>Modo demostración:</strong> Supabase aún no está configurado en este equipo; se muestran
            datos de muestra y no se pide inicio de sesión.
          </p>
        )}
        {children}
      </main>
      {!sesion.demo && <CierrePorInactividad />}
    </div>
  );
}
