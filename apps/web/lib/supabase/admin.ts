import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from './config';

/**
 * Cliente con la clave SECRETA: salta las reglas RLS. Sólo para tareas de administración de cuentas
 * (generar enlaces, restablecer 2FA, registrar accesos) y siempre después de comprobar el permiso de quien
 * lo pide con su propia sesión. Nunca debe llegar al navegador.
 */
export function clienteAdmin() {
  if (typeof window !== 'undefined') throw new Error('El cliente administrativo sólo se usa en el servidor');
  const clave = process.env.SUPABASE_SECRET_KEY;
  if (!clave) throw new Error('Falta SUPABASE_SECRET_KEY en apps/web/.env.local');
  return createClient(SUPABASE_URL, clave, { auth: { persistSession: false, autoRefreshToken: false } });
}
