'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SECCIONES } from '@/lib/navegacion';
import { BotonTema } from './BotonTema';
import { Icon } from './Icon';
import { Avatar } from './ui';

/** Pendientes de autorización (datos de muestra hasta la Fase 4). */
const PENDIENTES = 2;

export function MenuLateral() {
  const ruta = usePathname();
  const activo = (slug: string) => (slug === '' ? ruta === '/' : ruta.startsWith(`/${slug}`));

  return (
    <nav
      aria-label="Principal"
      className="flex shrink-0 flex-col gap-4 bg-nav px-4 py-4 lg:sticky lg:top-0 lg:h-dvh lg:w-62 lg:gap-7 lg:py-6"
    >
      <div className="flex items-center justify-between gap-3 px-2.5">
        <Link href="/" aria-label="CELMI Solutions, inicio">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-celmi-blanco.svg" alt="CELMI Solutions" width={150} height={27} />
        </Link>
        <div className="lg:hidden">
          <BotonTema />
        </div>
      </div>

      <ul className="-mx-1 flex gap-0.5 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:p-0">
        {SECCIONES.map((s) => {
          const on = activo(s.slug);
          return (
            <li key={s.slug}>
              <Link
                href={`/${s.slug}`}
                aria-current={on ? 'page' : undefined}
                className={`flex items-center gap-3 whitespace-nowrap rounded-sm px-3 py-2.5 text-sm transition-colors ${
                  on
                    ? 'bg-nav-activo font-semibold text-white'
                    : 'font-medium text-nav-texto hover:bg-white/8 hover:text-white'
                }`}
              >
                <Icon name={s.icono} />
                <span className="flex-1">{s.titulo}</span>
                {s.slug === 'autorizaciones' && (
                  <span className="min-w-5.5 rounded-pill bg-[#F5B544] px-1.5 text-center text-xs font-bold text-[#2B1B00]">
                    {PENDIENTES}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto hidden items-center gap-2.5 rounded-md bg-white/6 p-3 lg:flex">
        <Avatar iniciales="RR" color="#1D5BD8" tamano={36} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">Rodrigo Rivera</div>
          <div className="text-xs text-nav-texto">Preventa · Ejecutivo</div>
        </div>
        <BotonTema />
      </div>
    </nav>
  );
}
