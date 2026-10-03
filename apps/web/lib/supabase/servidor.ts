import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config';

/** Cliente de Supabase con la sesión del usuario (cookies). Todo lo que haga pasa por las reglas RLS. */
export async function clienteServidor() {
  const almacen = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => almacen.getAll(),
      setAll: (porGuardar) => {
        try {
          for (const { name, value, options } of porGuardar) almacen.set(name, value, options);
        } catch {
          // Desde un Server Component no se pueden escribir cookies; el proxy ya renueva la sesión.
        }
      },
    },
  });
}
