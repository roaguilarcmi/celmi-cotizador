import type { ReactNode } from 'react';

/** Pantallas de acceso: panel de marca a la izquierda (escritorio) y formulario a la derecha. */
export default function LayoutAcceso({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-nav p-12 text-white lg:flex">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <span className="absolute -right-40 -bottom-40 size-[560px] rounded-full bg-gradient-to-br from-[#0071F6] to-[#0057E2] opacity-25" />
          <span className="absolute -right-10 bottom-24 size-[300px] rounded-full border-[40px] border-white/6" />
          <span className="absolute -top-24 -left-24 size-[340px] rounded-full border-[56px] border-[#0064EC]/20" />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-celmi-blanco.svg"
          alt="CELMI Solutions"
          width={210}
          height={38}
          className="relative"
        />
        <div className="relative max-w-md">
          <p className="text-[34px] leading-tight font-bold tracking-tight">
            Cotizaciones claras, autorizadas y a tiempo.
          </p>
          <p className="mt-4 text-base text-nav-texto">
            Plataforma interna de CELMI Solutions para preparar, autorizar y emitir propuestas comerciales.
          </p>
        </div>
        <p className="relative text-xs text-nav-texto">
          Acceso exclusivo para personal autorizado. Toda la actividad queda registrada.
        </p>
      </aside>

      <main className="flex items-center justify-center bg-fondo px-4 py-10 sm:px-8">
        <div className="animar-entrada w-full max-w-[420px]">
          <div className="mb-8 inline-flex rounded-lg bg-nav px-4 py-3 lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-celmi-blanco.svg" alt="CELMI Solutions" width={150} height={27} />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
