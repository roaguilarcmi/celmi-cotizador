import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { politicaDeContenido, nuevoNonce } from '@/lib/seguridad';
import {
  esRutaDeAcceso,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
  supabaseConfigurado,
} from '@/lib/supabase/config';

/**
 * Primera barrera (optimista): renueva la sesión y redirige a quien no la tiene completa. También pone la política de
 * seguridad del contenido con un nonce nuevo por petición (Next.js lo aplica a sus scripts al renderizar).
 * La protección real está en el servidor (lib/sesion.ts) y en las reglas RLS de la base.
 */
export async function proxy(request: NextRequest) {
  const nonce = nuevoNonce();
  const https = request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
  const csp = politicaDeContenido({
    nonce,
    desarrollo: process.env.NODE_ENV === 'development',
    supabaseUrl: SUPABASE_URL,
    https,
  });

  // La petición que sigue lleva el nonce (Next.js lo lee del encabezado CSP) y las cookies vigentes.
  const seguir = () => {
    const encabezados = new Headers(request.headers);
    encabezados.set('x-nonce', nonce);
    encabezados.set('content-security-policy', csp);
    return NextResponse.next({ request: { headers: encabezados } });
  };
  const conPolitica = (r: NextResponse) => {
    r.headers.set('content-security-policy', csp);
    return r;
  };

  if (!supabaseConfigurado) return conPolitica(seguir());

  let respuesta = seguir();
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (porGuardar, encabezados) => {
        for (const { name, value } of porGuardar) request.cookies.set(name, value);
        respuesta = seguir();
        for (const { name, value, options } of porGuardar) respuesta.cookies.set(name, value, options);
        for (const [clave, valor] of Object.entries(encabezados)) respuesta.headers.set(clave, valor);
      },
    },
  });

  // getClaims valida la firma del token; nunca confiar en getSession() en el servidor.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const ruta = request.nextUrl.pathname;

  if (esRutaDeAcceso(ruta)) return conPolitica(respuesta);

  const destino = (camino: string) => {
    const url = request.nextUrl.clone();
    url.pathname = camino;
    url.search = '';
    if (ruta !== '/') url.searchParams.set('siguiente', ruta);
    const r = NextResponse.redirect(url);
    for (const c of respuesta.cookies.getAll()) r.cookies.set(c);
    return conPolitica(r);
  };

  if (!claims) return destino('/entrar');
  // 2FA obligatoria: sin segundo factor verificado sólo se puede completar la verificación.
  if (claims.aal !== 'aal2') return destino('/entrar/verificar');
  return conPolitica(respuesta);
}

export const config = {
  // Todo excepto archivos estáticos, imágenes y el service worker de avisos (public/sw.js, sin datos) (el CSP va en las páginas; los estáticos llevan los demás encabezados
  // desde next.config.ts).
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sw\\.js$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
