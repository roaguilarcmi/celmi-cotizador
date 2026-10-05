'use server';

import { tareaSchema } from '@celmi/validation';
import { revalidatePath } from 'next/cache';
import { leerFormulario } from './datos';
import { obtenerSesion } from './sesion';
import { clienteServidor } from './supabase/servidor';

export interface EstadoTarea {
  error?: string;
  ok?: string;
}

export interface Aviso {
  id: string;
  titulo: string;
  oportunidadId: string;
  oportunidad: string;
  avisoEn: string;
  venceEn: string;
}

const refrescar = (oportunidadId?: string) => {
  revalidatePath('/tareas');
  revalidatePath('/');
  if (oportunidadId) revalidatePath(`/oportunidades/${oportunidadId}`);
};

export async function crearTarea(
  oportunidadId: string,
  _previo: EstadoTarea,
  datos: FormData,
): Promise<EstadoTarea> {
  await obtenerSesion();
  const leido = tareaSchema.safeParse(leerFormulario(datos));
  if (!leido.success) return { error: leido.error.issues[0]?.message };
  const { titulo, descripcion, vence_en, aviso } = leido.data;
  const vence = new Date(vence_en);
  const avisoEn = aviso === 'sin' ? null : new Date(vence.getTime() - Number(aviso) * 60_000).toISOString();

  const supabase = await clienteServidor();
  // responsable_id lo pone la base (auth.uid()): una tarea siempre es de quien la crea.
  const { error } = await supabase.from('tareas').insert({
    oportunidad_id: oportunidadId,
    titulo,
    descripcion,
    vence_en: vence.toISOString(),
    aviso_en: avisoEn,
  });
  if (error) return { error: 'No se pudo guardar la tarea.' };
  refrescar(oportunidadId);
  return { ok: 'Tarea programada.' };
}

export async function cambiarEstadoTarea(
  id: string,
  estado: 'pendiente' | 'completada' | 'cancelada',
): Promise<EstadoTarea> {
  await obtenerSesion();
  const supabase = await clienteServidor();
  const { data, error } = await supabase
    .from('tareas')
    .update({ estado })
    .eq('id', id)
    .select('oportunidad_id')
    .maybeSingle();
  if (error || !data) return { error: 'No se pudo actualizar la tarea.' };
  refrescar(data.oportunidad_id as string);
  return {
    ok:
      estado === 'completada'
        ? 'Tarea completada.'
        : estado === 'cancelada'
          ? 'Tarea cancelada.'
          : 'Tarea reabierta.',
  };
}

/** Avisos pendientes de las próximas horas, para programar las notificaciones en el navegador. */
export async function proximosAvisos(): Promise<Aviso[]> {
  const sesion = await obtenerSesion();
  if (sesion.demo) return [];
  const supabase = await clienteServidor();
  const hasta = new Date(Date.now() + 26 * 3_600_000).toISOString();
  const { data } = await supabase
    .from('tareas')
    .select('id, titulo, aviso_en, vence_en, oportunidad_id, oportunidad:oportunidades(nombre)')
    .eq('estado', 'pendiente')
    .not('aviso_en', 'is', null)
    .lte('aviso_en', hasta)
    .order('aviso_en');
  return (
    (data ?? []) as unknown as {
      id: string;
      titulo: string;
      aviso_en: string;
      vence_en: string;
      oportunidad_id: string;
      oportunidad: { nombre: string } | null;
    }[]
  ).map((t) => ({
    id: t.id,
    titulo: t.titulo,
    oportunidadId: t.oportunidad_id,
    oportunidad: t.oportunidad?.nombre ?? '',
    avisoEn: t.aviso_en,
    venceEn: t.vence_en,
  }));
}
