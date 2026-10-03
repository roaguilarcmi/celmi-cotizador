import Link from 'next/link';
import { Icon } from '@/components/Icon';

export const metadata = { title: 'Página no encontrada' };

/** Cualquier dirección que no existe: pantalla con la identidad de CELMI en lugar de la genérica de Next.js. */
export default function NoEncontrada() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-fondo px-4">
      <div className="animar-entrada w-full max-w-md text-center">
        <div className="mx-auto mb-8 inline-flex rounded-lg bg-nav px-4 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-celmi-blanco.svg" alt="CELMI Solutions" width={150} height={27} />
        </div>
        <p className="text-sm font-bold tracking-wide text-acento-texto">ERROR 404</p>
        <h1 className="mt-2 text-[28px] leading-tight font-bold tracking-tight">Esta página no existe</h1>
        <p className="mt-2 text-sm text-texto-suave">
          Es posible que la dirección esté mal escrita o que la sección se haya movido.
        </p>
        <Link
          href="/"
          className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-md bg-acento px-5 text-sm font-semibold text-sobre-acento hover:brightness-110"
        >
          <Icon name="inicio" /> Ir al inicio
        </Link>
      </div>
    </main>
  );
}
