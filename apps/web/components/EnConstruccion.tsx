import Link from 'next/link';
import type { ReactNode } from 'react';
import { SECCIONES } from '@/lib/navegacion';
import { Icon } from './Icon';
import { Tarjeta } from './ui';

/** Pantalla de sección aún no construida: dice en qué fase del plan llega. */
export function EnConstruccion({ slug, children }: { slug: string; children?: ReactNode }) {
  const s = SECCIONES.find((x) => x.slug === slug);
  if (!s) throw new Error(`Sección desconocida: ${slug}`);
  return (
    <div className="animar-entrada mx-auto max-w-[1440px]">
      <h1 className="mb-6 text-[28px] font-bold tracking-tight">{s.titulo}</h1>
      <Tarjeta className="flex flex-col items-center px-6 py-14 text-center">
        <span className="mb-4 inline-flex size-14 items-center justify-center rounded-pill bg-acento-suave text-acento-texto">
          <Icon name={s.icono} size={26} />
        </span>
        <p className="text-lg font-bold">Se construye en la Fase {s.fase}</p>
        <p className="mt-1.5 max-w-md text-sm text-texto-suave">{s.descripcion}</p>
        {children}
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-acento-texto hover:underline"
        >
          <Icon name="izquierda" size={16} /> Volver al inicio
        </Link>
      </Tarjeta>
    </div>
  );
}
