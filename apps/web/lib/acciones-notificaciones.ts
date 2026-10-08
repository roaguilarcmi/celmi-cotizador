'use server';

import { revalidatePath } from 'next/cache';
import { obtenerSesion } from './sesion';
import { clienteServidor } from './supabase/servidor';

/** Marca como leídos los avisos indicados (o todos los pendientes). RLS: sólo los propios. */
export async function marcarNotificacionesLeidas(ids?: string[]): Promise<{ error?: string }> {
  await obtenerSesion();
  const supabase = await clienteServidor();
  let q = supabase.from('notificaciones').update({ leida_en: new Date().toISOString() }).is('leida_en', null);
  if (ids) {
    const validos = ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 50);
    if (!validos.length) return {};
    q = q.in('id', validos);
  }
  const { error } = await q;
  if (error) return { error: 'No se pudieron marcar los avisos.' };
  revalidatePath('/', 'layout');
  return {};
}
