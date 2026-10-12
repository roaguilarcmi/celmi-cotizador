/**
 * Política de seguridad del contenido (CSP) para publicar la web (decisión 2026-10-07). Sigue la guía de Next.js 16
 * (`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`): un nonce nuevo por petición, generado en
 * `proxy.ts`; sólo se ejecutan los scripts que lo traen (y los que éstos cargan: 'strict-dynamic').
 *
 * - Estilos: 'unsafe-inline' porque React escribe atributos `style` (anchos, colores del editor) que un nonce no cubre;
 *   el riesgo de inyectar CSS es mucho menor que el de scripts, que siguen bloqueados.
 * - Conexiones: sólo la propia web y Supabase (el navegador habla con Supabase Auth para la 2FA).
 * - En desarrollo React necesita 'unsafe-eval'; en producción no.
 */
export function politicaDeContenido({
  nonce,
  desarrollo,
  supabaseUrl,
  https,
}: {
  nonce: string;
  desarrollo: boolean;
  supabaseUrl: string;
  /** Sólo si el sitio se sirve por HTTPS se pide subir a HTTPS cualquier recurso (en 127.0.0.1 rompería la web). */
  https: boolean;
}): string {
  const supabase = supabaseUrl ? [supabaseUrl, supabaseUrl.replace(/^https:/, 'wss:')] : [];
  const directivas = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${desarrollo ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    // pdf.js lee los PDF de las financieras en un worker del mismo origen (2026-10-12).
    "worker-src 'self'",
    `connect-src 'self' ${supabase.join(' ')}${desarrollo ? ' ws:' : ''}`.trim(),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(https ? ['upgrade-insecure-requests'] : []),
  ];
  return directivas.join('; ');
}

/** Nonce de un solo uso (aleatorio criptográfico; Web Crypto existe en el runtime de proxy). */
export const nuevoNonce = () => btoa(crypto.randomUUID());
