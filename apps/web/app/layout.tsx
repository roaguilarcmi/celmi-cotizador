import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { SCRIPT_INICIAL } from '@/lib/scripts-iniciales';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Cotizador CELMI', template: '%s · Cotizador CELMI' },
  description: 'Plataforma de oportunidades, autorización y emisión de cotizaciones de CELMI Solutions.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#29235C' },
    { media: '(prefers-color-scheme: dark)', color: '#121029' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Nonce del CSP (proxy.ts). Leer los encabezados hace dinámica cada página: es lo que exige el nonce.
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="es-MX" className={jakarta.variable} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SCRIPT_INICIAL }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
