import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { MenuLateral } from '@/components/MenuLateral';
import { SCRIPT_INICIAL } from '@/lib/scripts-iniciales';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Cotizador CELMI', template: '%s · Cotizador CELMI' },
  description: 'Plataforma de oportunidades, autorización y emisión de cotizaciones de CELMI Solutions.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#29235C' },
    { media: '(prefers-color-scheme: dark)', color: '#121029' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-MX" className={jakarta.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_INICIAL }} />
      </head>
      <body className="min-h-dvh">
        <div className="flex min-h-dvh flex-col lg:flex-row">
          <MenuLateral />
          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-9 lg:py-7">{children}</main>
        </div>
      </body>
    </html>
  );
}
