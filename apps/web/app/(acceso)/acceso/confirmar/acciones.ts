'use server';

import { redirect } from 'next/navigation';
import { clienteServidor } from '@/lib/supabase/servidor';

/** Canjea el enlace de alta o recuperación generado por el administrador y abre una sesión temporal. */
export async function confirmarEnlace(datos: FormData) {
  const tokenHash = String(datos.get('token_hash') ?? '');
  const tipo = String(datos.get('tipo') ?? '');
  if (!tokenHash || (tipo !== 'invite' && tipo !== 'recovery')) redirect('/entrar?error=enlace-vencido');

  const supabase = await clienteServidor();
  await supabase.auth.signOut();
  const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash });
  if (error) redirect('/entrar?error=enlace-vencido');
  redirect(`/restablecer?tipo=${tipo}`);
}
