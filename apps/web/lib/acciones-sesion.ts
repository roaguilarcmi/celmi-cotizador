'use server';

import { redirect } from 'next/navigation';
import { registrarAcceso } from './accesos';
import { supabaseConfigurado } from './supabase/config';
import { clienteServidor } from './supabase/servidor';

/** Cierra la sesión y la registra. `motivo` se muestra en la pantalla de inicio de sesión. */
export async function cerrarSesion(motivo?: 'inactividad') {
  if (!supabaseConfigurado) redirect('/');
  const supabase = await clienteServidor();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) await registrarAcceso('cierre', { usuarioId: data.claims.sub });
  await supabase.auth.signOut();
  redirect(motivo ? `/entrar?motivo=${motivo}` : '/entrar');
}
