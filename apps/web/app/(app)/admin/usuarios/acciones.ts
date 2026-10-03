'use server';

import { altaUsuarioSchema } from '@celmi/validation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { registrarAcceso } from '@/lib/accesos';
import { exigirPermiso } from '@/lib/sesion';
import { clienteAdmin } from '@/lib/supabase/admin';
import { clienteServidor } from '@/lib/supabase/servidor';

export interface Resultado {
  error?: string;
  ok?: string;
  /** Enlace de un solo uso para entregar por un canal interno. */
  enlace?: { url: string; para: string; tipo: 'invite' | 'recovery' };
}

const PERMISO = 'usuarios.administrar';

async function construirEnlace(tokenHash: string, tipo: 'invite' | 'recovery') {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '127.0.0.1:3000';
  const local = /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host);
  const protocolo = h.get('x-forwarded-proto') ?? (local ? 'http' : 'https');
  return `${protocolo}://${host}/acceso/confirmar?token_hash=${encodeURIComponent(tokenHash)}&type=${tipo}`;
}

/** Crea la cuenta (sin enviar correo) y devuelve el enlace de alta. */
export async function darDeAlta(_previo: Resultado, datos: FormData): Promise<Resultado> {
  const sesion = await exigirPermiso(PERMISO);
  if (sesion.demo) return { error: 'Disponible al conectar Supabase.' };
  const leido = altaUsuarioSchema.safeParse(Object.fromEntries(datos));
  if (!leido.success) return { error: leido.error.issues[0]?.message ?? 'Revisa los datos.' };
  const { correo, nombre, puesto, rol } = leido.data;

  const admin = clienteAdmin();
  const { data, error } = await admin.auth.admin.generateLink({ type: 'invite', email: correo });
  if (error || !data.user) {
    return {
      error:
        error?.code === 'email_exists'
          ? 'Ya existe una cuenta con ese correo.'
          : 'No se pudo crear la cuenta.',
    };
  }
  // El perfil se inserta con la sesión del administrador: queda en la auditoría a su nombre.
  const supabase = await clienteServidor();
  const { error: e2 } = await supabase
    .from('perfiles')
    .insert({ id: data.user.id, nombre, correo, puesto, rol_id: rol });
  if (e2) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: 'No se pudo registrar el perfil. No se creó la cuenta.' };
  }
  await registrarAcceso('invitacion', { usuarioId: data.user.id, correo, realizadoPor: sesion.usuarioId });
  revalidatePath('/admin/usuarios');
  return {
    ok: `Se dio de alta a ${nombre}.`,
    enlace: {
      url: await construirEnlace(data.properties.hashed_token, 'invite'),
      para: nombre,
      tipo: 'invite',
    },
  };
}

export async function enlaceRecuperacion(usuarioId: string): Promise<Resultado> {
  const sesion = await exigirPermiso(PERMISO);
  if (sesion.demo) return { error: 'Disponible al conectar Supabase.' };
  const admin = clienteAdmin();
  const { data: u } = await admin.auth.admin.getUserById(usuarioId);
  if (!u.user?.email) return { error: 'No se encontró al usuario.' };
  const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email: u.user.email });
  if (error) return { error: 'No se pudo generar el enlace.' };
  await registrarAcceso('recuperacion', { usuarioId, correo: u.user.email, realizadoPor: sesion.usuarioId });
  const { data: p } = await admin.from('perfiles').select('nombre').eq('id', usuarioId).maybeSingle();
  return {
    enlace: {
      url: await construirEnlace(data.properties.hashed_token, 'recovery'),
      para: (p?.nombre as string | undefined) ?? u.user.email,
      tipo: 'recovery',
    },
  };
}

/** Borra los factores de 2FA: al entrar, la persona deberá configurar su app de nuevo. */
export async function restablecer2fa(usuarioId: string): Promise<Resultado> {
  const sesion = await exigirPermiso(PERMISO);
  if (sesion.demo) return { error: 'Disponible al conectar Supabase.' };
  const admin = clienteAdmin();
  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: usuarioId });
  if (error) return { error: 'No se pudo consultar la verificación del usuario.' };
  for (const f of data.factors) await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: usuarioId });
  await registrarAcceso('mfa_restablecido', { usuarioId, realizadoPor: sesion.usuarioId });
  revalidatePath('/admin/usuarios');
  return { ok: 'Se restableció la verificación en dos pasos. La configurará al volver a entrar.' };
}

export async function cambiarEstado(usuarioId: string, activo: boolean): Promise<Resultado> {
  const sesion = await exigirPermiso(PERMISO);
  if (sesion.demo) return { error: 'Disponible al conectar Supabase.' };
  if (usuarioId === sesion.usuarioId) return { error: 'No puedes desactivar tu propia cuenta.' };
  const supabase = await clienteServidor();
  const { error } = await supabase.from('perfiles').update({ activo }).eq('id', usuarioId);
  if (error) return { error: 'No se pudo cambiar el estado.' };
  await registrarAcceso(activo ? 'reactivado' : 'desactivado', { usuarioId, realizadoPor: sesion.usuarioId });
  revalidatePath('/admin/usuarios');
  return { ok: activo ? 'Usuario reactivado.' : 'Usuario desactivado: ya no puede entrar.' };
}

export async function cambiarRol(usuarioId: string, rol: string): Promise<Resultado> {
  const sesion = await exigirPermiso(PERMISO);
  if (sesion.demo) return { error: 'Disponible al conectar Supabase.' };
  if (usuarioId === sesion.usuarioId) return { error: 'No puedes cambiar tu propio rol.' };
  const supabase = await clienteServidor();
  const { error } = await supabase.from('perfiles').update({ rol_id: rol }).eq('id', usuarioId);
  if (error) return { error: 'No se pudo cambiar el rol.' };
  revalidatePath('/admin/usuarios');
  return { ok: 'Rol actualizado.' };
}
