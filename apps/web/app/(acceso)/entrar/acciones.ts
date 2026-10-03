'use server';

import { redirect } from 'next/navigation';
import { registrarAcceso } from '@/lib/accesos';
import { rutaSegura } from '@/lib/sesion';
import { clienteAdmin } from '@/lib/supabase/admin';
import { supabaseConfigurado } from '@/lib/supabase/config';
import { clienteServidor } from '@/lib/supabase/servidor';

export interface EstadoEntrar {
  error: string | null;
}

export async function iniciarSesion(_previo: EstadoEntrar, datos: FormData): Promise<EstadoEntrar> {
  if (!supabaseConfigurado) return { error: 'Supabase aún no está configurado en este equipo.' };
  const correo = String(datos.get('correo') ?? '')
    .trim()
    .toLowerCase();
  const contrasena = String(datos.get('contrasena') ?? '');
  const siguiente = rutaSegura(datos.get('siguiente'));
  if (!correo || !contrasena) return { error: 'Escribe tu correo y tu contraseña.' };

  const supabase = await clienteServidor();
  const { data, error } = await supabase.auth.signInWithPassword({ email: correo, password: contrasena });

  if (error || !data.user) {
    await registrarAcceso('fallido', { correo });
    // Mensaje genérico: no revela si el correo existe.
    return {
      error:
        error?.code === 'over_request_rate_limit'
          ? 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.'
          : 'Correo o contraseña incorrectos.',
    };
  }

  const { data: perfil } = await clienteAdmin()
    .from('perfiles')
    .select('activo')
    .eq('id', data.user.id)
    .maybeSingle();
  if (!perfil?.activo) {
    await registrarAcceso('bloqueo', { usuarioId: data.user.id, correo });
    await supabase.auth.signOut();
    return { error: 'Tu cuenta no está habilitada. Pídele acceso a un administrador.' };
  }

  await registrarAcceso('inicio', { usuarioId: data.user.id, correo });
  const { data: factores } = await supabase.auth.mfa.listFactors();
  const conSegundoFactor = (factores?.totp ?? []).some((f) => f.status === 'verified');
  const consulta = `?siguiente=${encodeURIComponent(siguiente)}`;
  redirect(conSegundoFactor ? `/entrar/verificar${consulta}` : `/entrar/configurar-2fa${consulta}`);
}
