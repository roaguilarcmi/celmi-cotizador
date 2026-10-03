'use server';

import { notaSchema, oportunidadSchema } from '@celmi/validation';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { leerFormulario } from '@/lib/datos';
import { exigirPermiso, obtenerSesion } from '@/lib/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';

export interface EstadoFormulario {
  error?: string;
  ok?: string;
}

/** Paso 1 del wizard: crea la oportunidad a nombre de quien la captura (o del ejecutivo que elija un admin). */
export async function crearOportunidad(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const sesion = await exigirPermiso('oportunidades.crear');
  const campos = leerFormulario(datos);
  const leido = oportunidadSchema.safeParse(campos);
  if (!leido.success) return { error: leido.error.issues[0]?.message };

  const ejecutivo =
    campos.ejecutivo_id && sesion.permisos.has('oportunidades.editar_todas')
      ? campos.ejecutivo_id
      : sesion.usuarioId;
  const supabase = await clienteServidor();
  const { data, error } = await supabase
    .from('oportunidades')
    .insert({ ...leido.data, ejecutivo_id: ejecutivo })
    .select('id')
    .single();
  if (error || !data) return { error: 'No se pudo crear la oportunidad.' };
  revalidatePath('/oportunidades');
  revalidatePath('/');
  redirect(`/oportunidades/${data.id}`);
}

export async function actualizarOportunidad(
  id: string,
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  await obtenerSesion();
  const leido = oportunidadSchema.safeParse(leerFormulario(datos));
  if (!leido.success) return { error: leido.error.issues[0]?.message };
  const supabase = await clienteServidor();
  const { error, count } = await supabase
    .from('oportunidades')
    .update(leido.data, { count: 'exact' })
    .eq('id', id);
  if (error || !count) return { error: 'No tienes permiso para modificar esta oportunidad.' };
  revalidatePath(`/oportunidades/${id}`);
  revalidatePath('/oportunidades');
  return { ok: 'Datos actualizados.' };
}

/** Cambia el estado; la base valida quién puede hacerlo y lo registra en la bitácora. */
export async function cambiarEstado(id: string, estado: string): Promise<EstadoFormulario> {
  await obtenerSesion();
  const supabase = await clienteServidor();
  const { error, count } = await supabase
    .from('oportunidades')
    .update({ estado_id: estado }, { count: 'exact' })
    .eq('id', id);
  if (error?.code === '42501')
    return { error: 'Sólo el ejecutivo de la oportunidad o un administrador cambian su estado.' };
  if (error || !count) return { error: 'No se pudo cambiar el estado.' };
  revalidatePath(`/oportunidades/${id}`);
  revalidatePath('/oportunidades');
  revalidatePath('/');
  return { ok: 'Estado actualizado.' };
}

export async function agregarNota(
  oportunidadId: string,
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const sesion = await obtenerSesion();
  const leido = notaSchema.safeParse(leerFormulario(datos));
  if (!leido.success) return { error: leido.error.issues[0]?.message };
  const supabase = await clienteServidor();
  const { error } = await supabase
    .from('seguimiento')
    .insert({ ...leido.data, oportunidad_id: oportunidadId, autor_id: sesion.usuarioId });
  if (error) return { error: 'No se pudo guardar la nota.' };
  revalidatePath(`/oportunidades/${oportunidadId}`);
  revalidatePath('/');
  return { ok: 'Nota agregada.' };
}
