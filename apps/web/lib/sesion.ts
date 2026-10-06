import { redirect } from 'next/navigation';
import { cache } from 'react';
import { CONSULTAS } from './consultas';
import { supabaseConfigurado } from './supabase/config';
import { clienteServidor } from './supabase/servidor';

export interface Sesion {
  usuarioId: string;
  correo: string;
  nombre: string;
  puesto: string;
  rol: string;
  permisos: ReadonlySet<string>;
  /** Sin Supabase configurado: usuario de muestra para seguir diseñando. */
  demo: boolean;
}

const SESION_DEMO: Sesion = {
  usuarioId: 'demo',
  correo: 'rodrigo.aguilar@celmi.com.mx',
  nombre: 'Rodrigo Rivera',
  puesto: 'Preventa',
  rol: 'Modo demostración',
  permisos: new Set(['usuarios.administrar', 'utilidad.autorizar']),
  demo: true,
};

interface FilaPerfil {
  nombre: string;
  puesto: string;
  correo: string;
  roles: { nombre: string } | null;
}

/**
 * Sesión verificada del usuario (una vez por petición). Exige token válido, 2FA (aal2) y perfil activo;
 * si falta algo, redirige. Es la protección del servidor: el proxy sólo es una primera barrera.
 */
export const obtenerSesion = cache(async (): Promise<Sesion> => {
  if (!supabaseConfigurado) return SESION_DEMO;

  const supabase = await clienteServidor();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect('/entrar');
  if (claims.aal !== 'aal2') redirect('/entrar/verificar');

  const [perfil, permisos] = await Promise.all([
    supabase.from('perfiles').select(CONSULTAS.perfilSesion).eq('id', claims.sub).maybeSingle(),
    supabase.rpc('mis_permisos'),
  ]);
  // Las reglas RLS ocultan el perfil si no existe o está desactivado.
  const fila = perfil.data as FilaPerfil | null;
  if (!fila) redirect('/entrar?error=sin-acceso');

  return {
    usuarioId: claims.sub,
    correo: fila.correo,
    nombre: fila.nombre,
    puesto: fila.puesto,
    rol: fila.roles?.nombre ?? '',
    permisos: new Set((permisos.data as string[] | null) ?? []),
    demo: false,
  };
});

/** Exige un permiso para ver una página o ejecutar una acción. */
export async function exigirPermiso(permiso: string): Promise<Sesion> {
  const sesion = await obtenerSesion();
  if (!sesion.permisos.has(permiso)) redirect('/sin-permiso');
  return sesion;
}

/** Evita redirecciones abiertas: sólo rutas internas. */
export function rutaSegura(valor: unknown, porDefecto = '/'): string {
  return typeof valor === 'string' &&
    valor.startsWith('/') &&
    !valor.startsWith('//') &&
    !valor.includes('\\')
    ? valor
    : porDefecto;
}
