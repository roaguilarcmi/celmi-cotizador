'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cerrarSesion } from '@/lib/acciones-sesion';
import { SECCIONES } from '@/lib/navegacion';
import { usePreferencia } from '@/lib/preferencias';
import type { Notificacion } from '@/lib/datos';
import { BotonTema } from './BotonTema';
import { Icon } from './Icon';
import { Notificaciones } from './Notificaciones';
import { Avatar } from './ui';

/**
 * Menú lateral. En escritorio se puede compactar a una barra de íconos para dar más espacio al módulo.
 * El estado vive en <html data-menu="compacto"> (aplicado antes de pintar, sin parpadeo) y en localStorage.
 */
interface Props {
  usuario: { nombre: string; rol: string; iniciales: string };
  permisos: string[];
  demo: boolean;
  /** Número a mostrar junto a una sección (p. ej. tareas por vencer). */
  contadores?: Record<string, number>;
  /** Avisos dentro de la app (0027). */
  notificaciones?: Notificacion[];
}

export function MenuLateral({ usuario, permisos, demo, contadores = {}, notificaciones = [] }: Props) {
  const ruta = usePathname();
  const activo = (slug: string) => (slug === '' ? ruta === '/' : ruta.startsWith(`/${slug}`));
  const [menu, guardarMenu] = usePreferencia('celmi-menu');
  const compacto = menu === 'compacto';

  const alternar = () => {
    const nuevo = !compacto;
    if (nuevo) document.documentElement.dataset.menu = 'compacto';
    else delete document.documentElement.dataset.menu;
    guardarMenu(nuevo ? 'compacto' : null);
  };

  return (
    <nav
      aria-label="Principal"
      className="flex shrink-0 flex-col gap-4 bg-nav px-4 py-4 lg:sticky lg:top-0 lg:h-dvh lg:w-62 lg:gap-7 lg:py-6 lg:transition-[width,padding] lg:duration-200 lg:compacto:w-19 lg:compacto:px-3"
    >
      <div className="flex items-center justify-between gap-2 px-2.5 lg:compacto:flex-col lg:compacto:justify-center lg:compacto:px-0">
        <Link href="/" aria-label="CELMI Solutions, inicio" className="lg:compacto:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-celmi-blanco.svg" alt="CELMI Solutions" width={150} height={27} />
        </Link>
        <div className="ml-auto flex items-center gap-1 lg:compacto:ml-0">
          {!demo && <Notificaciones avisos={notificaciones} />}
        </div>
        <div className="flex items-center gap-1 lg:hidden">
          <BotonTema />
          {!demo && (
            <form action={() => cerrarSesion()}>
              <button
                type="submit"
                aria-label="Cerrar sesión"
                className="inline-flex size-10 cursor-pointer items-center justify-center rounded-md text-nav-texto hover:bg-white/10 hover:text-white"
              >
                <Icon name="salir" />
              </button>
            </form>
          )}
        </div>
        <button
          type="button"
          onClick={alternar}
          aria-expanded={!compacto}
          aria-label={compacto ? 'Expandir menú' : 'Compactar menú'}
          title={compacto ? 'Expandir menú' : 'Compactar menú'}
          className="hidden size-9 cursor-pointer items-center justify-center rounded-md text-nav-texto transition-colors hover:bg-white/10 hover:text-white lg:inline-flex"
        >
          <Icon name={compacto ? 'expandir' : 'compactar'} size={18} />
        </button>
      </div>

      <ul className="-mx-1 flex gap-0.5 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:p-0">
        {SECCIONES.filter((s) => !s.permiso || permisos.includes(s.permiso)).map((s) => {
          const on = activo(s.slug);
          return (
            <li key={s.slug}>
              <Link
                href={`/${s.slug}`}
                aria-current={on ? 'page' : undefined}
                title={s.titulo}
                className={`relative flex items-center gap-3 whitespace-nowrap rounded-sm px-3 py-2.5 text-sm transition-colors lg:compacto:justify-center lg:compacto:px-0 ${
                  on
                    ? 'bg-nav-activo font-semibold text-white'
                    : 'font-medium text-nav-texto hover:bg-white/8 hover:text-white'
                }`}
              >
                <Icon name={s.icono} size={compacto ? 20 : 18} />
                <span className="flex-1 lg:compacto:sr-only">{s.titulo}</span>
                {(contadores[s.slug] ?? 0) > 0 && (
                  <span className="min-w-5.5 rounded-pill bg-[#F5B544] px-1.5 text-center text-xs font-bold text-[#2B1B00] lg:compacto:absolute lg:compacto:top-0.5 lg:compacto:right-0.5 lg:compacto:min-w-4.5 lg:compacto:px-1 lg:compacto:text-[10px]">
                    {contadores[s.slug]}
                    <span className="sr-only"> pendientes</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto hidden items-center gap-2 rounded-md bg-white/6 p-3 lg:flex lg:compacto:flex-col lg:compacto:p-2">
        <Avatar iniciales={usuario.iniciales} color="#1D5BD8" tamano={36} />
        <div className="min-w-0 flex-1 lg:compacto:sr-only">
          <div className="truncate text-sm font-semibold text-white">{usuario.nombre}</div>
          <div className="truncate text-xs text-nav-texto">{usuario.rol}</div>
        </div>
        <BotonTema />
        {!demo && (
          <form action={() => cerrarSesion()}>
            <button
              type="submit"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              className="inline-flex size-10 cursor-pointer items-center justify-center rounded-md text-nav-texto transition-colors hover:bg-white/10 hover:text-white"
            >
              <Icon name="salir" />
            </button>
          </form>
        )}
      </div>
    </nav>
  );
}
