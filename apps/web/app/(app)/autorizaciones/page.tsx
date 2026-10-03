import Link from 'next/link';
import { EnConstruccion } from '@/components/EnConstruccion';
import { Icon } from '@/components/Icon';
import { FOLIO_EPOXEMEX } from '@/lib/epoxemex';

export const metadata = { title: 'Autorizaciones' };

export default function Page() {
  return (
    <EnConstruccion slug="autorizaciones">
      <Link
        href="/autorizaciones/epoxemex"
        className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-md bg-acento px-4 text-sm font-semibold text-sobre-acento hover:brightness-110"
      >
        Ver demostración con {FOLIO_EPOXEMEX} <Icon name="derecha" strokeWidth={2.2} />
      </Link>
    </EnConstruccion>
  );
}
