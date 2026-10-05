'use server';

import { leerContenido, tareaSchema, textoPlano } from '@celmi/validation';
import { revalidatePath } from 'next/cache';
import { obtenerSesion } from './sesion';
import { clienteServidor } from './supabase/servidor';

export interface EstadoTarea {
  error?: string;
  ok?: string;
}

export interface Aviso {
  /** Identificador del aviso (una tarea puede tener varios). */
  id: string;
  tareaId: string;
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

/** Lee y valida el formulario de tarea (título, vencimiento, avisos y notas con formato). */
function leerTarea(datos: FormData) {
  let avisos: unknown = [];
  try {
    avisos = JSON.parse(String(datos.get('avisos') ?? '[]'));
  } catch {
    return { error: 'Los avisos no son válidos.' } as const;
  }
  const leido = tareaSchema.safeParse({
    titulo: datos.get('titulo'),
    vence_en: datos.get('vence_en'),
    avisos,
  });
  if (!leido.success) return { error: leido.error.issues[0]?.message ?? 'Revisa la tarea.' } as const;
  const notas = leerContenido(datos.get('notas'));
  if (!notas.ok) return { error: notas.error } as const;
  return {
    fila: {
      titulo: leido.data.titulo,
      vence_en: new Date(leido.data.vence_en).toISOString(),
      notas: notas.doc,
      descripcion: notas.doc ? textoPlano(notas.doc).slice(0, 2000) : '',
    },
    avisos: leido.data.avisos,
  } as const;
}

async function guardarAvisos(tareaId: string, avisos: number[]) {
  const supabase = await clienteServidor();
  await supabase.from('tarea_avisos').delete().eq('tarea_id', tareaId);
  if (avisos.length === 0) return null;
  // La hora de cada aviso la calcula la base a partir del vencimiento (el valor enviado se ignora).
  const { error } = await supabase
    .from('tarea_avisos')
    .insert(avisos.map((m) => ({ tarea_id: tareaId, minutos_antes: m, aviso_en: new Date().toISOString() })));
  return error;
}

export async function crearTarea(
  oportunidadId: string,
  _previo: EstadoTarea,
  datos: FormData,
): Promise<EstadoTarea> {
  await obtenerSesion();
  const leido = leerTarea(datos);
  if ('error' in leido) return { error: leido.error };
  const supabase = await clienteServidor();
  // responsable_id lo pone la base (auth.uid()): una tarea siempre es de quien la crea.
  const { data, error } = await supabase
    .from('tareas')
    .insert({ oportunidad_id: oportunidadId, ...leido.fila })
    .select('id')
    .single();
  if (error || !data) return { error: 'No se pudo guardar la tarea.' };
  if (await guardarAvisos(data.id as string, leido.avisos))
    return { error: 'La tarea se guardó, pero no sus avisos.' };
  refrescar(oportunidadId);
  return { ok: 'Tarea programada.' };
}

/** Edita o reprograma una tarea: título, fecha y hora, avisos y notas. */
export async function actualizarTarea(
  id: string,
  _previo: EstadoTarea,
  datos: FormData,
): Promise<EstadoTarea> {
  await obtenerSesion();
  const leido = leerTarea(datos);
  if ('error' in leido) return { error: leido.error };
  const supabase = await clienteServidor();
  const { data, error } = await supabase
    .from('tareas')
    .update(leido.fila)
    .eq('id', id)
    .select('oportunidad_id')
    .maybeSingle();
  if (error || !data) return { error: 'No se pudo guardar la tarea.' };
  if (await guardarAvisos(id, leido.avisos)) return { error: 'La tarea se guardó, pero no sus avisos.' };
  refrescar(data.oportunidad_id as string);
  return { ok: 'Tarea actualizada.' };
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

/** Avisos de tareas pendientes en las próximas horas, para programar las notificaciones en el navegador. */
export async function proximosAvisos(): Promise<Aviso[]> {
  const sesion = await obtenerSesion();
  if (sesion.demo) return [];
  const supabase = await clienteServidor();
  const hasta = new Date(Date.now() + 26 * 3_600_000).toISOString();
  const { data } = await supabase
    .from('tarea_avisos')
    .select(
      'id, aviso_en, tarea:tareas!inner(id, titulo, vence_en, estado, oportunidad_id, oportunidad:oportunidades(nombre))',
    )
    .eq('tarea.estado', 'pendiente')
    .lte('aviso_en', hasta)
    .order('aviso_en');
  type Fila = {
    id: string;
    aviso_en: string;
    tarea: {
      id: string;
      titulo: string;
      vence_en: string;
      oportunidad_id: string;
      oportunidad: { nombre: string } | null;
    };
  };
  return ((data ?? []) as unknown as Fila[]).map((a) => ({
    id: a.id,
    tareaId: a.tarea.id,
    titulo: a.tarea.titulo,
    oportunidadId: a.tarea.oportunidad_id,
    oportunidad: a.tarea.oportunidad?.nombre ?? '',
    avisoEn: a.aviso_en,
    venceEn: a.tarea.vence_en,
  }));
}
