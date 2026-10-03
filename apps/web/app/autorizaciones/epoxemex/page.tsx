import type { Metadata } from 'next';
import { AutorizacionDemo } from './AutorizacionDemo';

export const metadata: Metadata = { title: 'Autorizar precios · EPOXEMEX' };

export default function Page() {
  return <AutorizacionDemo />;
}
