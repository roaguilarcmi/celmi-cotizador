'use server';

import { registrarAcceso } from '@/lib/accesos';
import { clienteServidor } from '@/lib/supabase/servidor';

/** Registra que el usuario de la sesión actual inscribió su app autenticadora. */
export async function registrarInscripcion2fa() {
  const supabase = await clienteServidor();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) await registrarAcceso('mfa_inscrito', { usuarioId: data.claims.sub });
}
