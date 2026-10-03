import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { Tarjeta } from '@/components/ui';

export const metadata = { title: 'Sin permiso' };

export default function SinPermiso() {
  return (
    <div className="animar-entrada mx-auto max-w-[1440px]">
      <Tarjeta className="flex flex-col items-center px-6 py-14 text-center">
        <span className="mb-4 inline-flex size-14 items-center justify-center rounded-pill bg-aviso-suave text-aviso">
          <Icon name="candado" size={26} />
        </span>
        <h1 className="text-lg font-bold">No tienes permiso para ver esta sección</h1>
        <p className="mt-1.5 max-w-md text-sm text-texto-suave">
          Si la necesitas para tu trabajo, pídele a un administrador que revise tu rol.
        </p>
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
