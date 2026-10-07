import type { NextConfig } from 'next';

/**
 * Encabezados de seguridad para toda respuesta, incluidos los archivos estáticos (decisión 2026-10-07, al publicar).
 * El CSP con nonce lo pone proxy.ts en cada página.
 */
const ENCABEZADOS = [
  // Sólo HTTPS durante 2 años (el navegador lo ignora si la página llega por HTTP, como en 127.0.0.1).
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // No se muestra dentro de otros sitios (también lo dice el CSP con frame-ancestors).
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // Herramienta interna: que los buscadores no la indexen.
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
];

const nextConfig: NextConfig = {
  // Los paquetes del monorepo se publican como TypeScript fuente.
  transpilePackages: ['@celmi/core', '@celmi/ui', '@celmi/validation'],
  // No anunciar la tecnología del servidor.
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: ENCABEZADOS }];
  },
};

export default nextConfig;
