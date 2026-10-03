import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  esRutaDeAcceso,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
  supabaseConfigurado,
} from '@/lib/supabase/config';

/**
 * Primera barrera (optimista): renueva la sesión y redirige a quien no la tiene completa.
 * La protección real está en el servidor (lib/sesion.ts) y en las reglas RLS de la base.
 */
export async function proxy(request: NextRequest) {
  if (!supabaseConfigurado) return NextResponse.next();

  let respuesta = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (porGuardar, encabezados) => {
        for (const { name, value } of porGuardar) request.cookies.set(name, value);
        respuesta = NextResponse.next({ request });
        for (const { name, value, options } of porGuardar) respuesta.cookies.set(name, value, options);
        for (const [clave, valor] of Object.entries(encabezados)) respuesta.headers.set(clave, valor);
      },
    },
  });

  // getClaims valida la firma del token; nunca confiar en getSession() en el servidor.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const ruta = request.nextUrl.pathname;

  if (esRutaDeAcceso(ruta)) return respuesta;

  const destino = (camino: string) => {
    const url = request.nextUrl.clone();
    url.pathname = camino;
    url.search = '';
    if (ruta !== '/') url.searchParams.set('siguiente', ruta);
    const r = NextResponse.redirect(url);
    for (const c of respuesta.cookies.getAll()) r.cookies.set(c);
    return r;
  };

  if (!claims) return destino('/entrar');
  // 2FA obligatoria: sin segundo factor verificado sólo se puede completar la verificación.
  if (claims.aal !== 'aal2') return destino('/entrar/verificar');
  return respuesta;
}

export const config = {
  // Todo excepto archivos estáticos e imágenes.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
