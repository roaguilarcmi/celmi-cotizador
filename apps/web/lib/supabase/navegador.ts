import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config';

/** Cliente de Supabase para componentes del navegador (2FA, cambio de contraseña). */
export function clienteNavegador() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}
