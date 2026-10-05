'use server';

import {
  leerContenido,
  subtareasNuevasSchema,
  tareaSchema,
  textoPlano,
  tituloSubtareaSchema,
} from '@celmi/validation';
import { revalidatePath } from 'next/cache';
import { borrarBorrador } from './acciones-borradores';
import { ESTADOS_ABIERTOS, type EstadoTarea as Etapa } from './etapas-tareas';
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
  /** Nulo si la tarea no está ligada a una oportunidad. */
  oportunidadId: string | null;
  oportunidad: string;
  avisoEn: string;
  venceEn: string;
}

const refrescar = (oportunidadId?: string | null) => {
  revalidatePath('/tareas');
  revalidatePath('/');
  if (oportunidadId) revalidatePath(`/oportunidades/${oportunidadId}`);
};

const json = (valor: FormDataEntryValue | null, omision: string): unknown => {
  try {
    return JSON.parse(String(valor ?? omision));
  } catch {
    return undefined;
  }
};

/**
 * Lee y valida el formulario de tarea o subtarea: título, fecha opcional (con o sin hora), avisos y notas con
 * formato. Sin fecha no hay avisos; sin hora, sólo avisos de días antes.
 */
function leerTarea(datos: FormData) {
  const avisos = json(datos.get('avisos'), '[]');
  if (avisos === undefined) return { error: 'Los avisos no son válidos.' } as const;
  const vence = String(datos.get('vence_en') ?? '');
  const leido = tareaSchema.safeParse({
    titulo: datos.get('titulo'),
    vence_en: vence || null,
    sin_hora: Boolean(vence) && datos.get('sin_hora') === 'si',
    avisos,
  });
  if (!leido.success) return { error: leido.error.issues[0]?.message ?? 'Revisa la tarea.' } as const;
  const notas = leerContenido(datos.get('notas'));
  if (!notas.ok) return { error: notas.error } as const;
  return {
    fila: {
      titulo: leido.data.titulo,
      vence_en: leido.data.vence_en ? new Date(leido.data.vence_en).toISOString() : null,
      sin_hora: leido.data.sin_hora,
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

const esUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/**
 * Crea una tarea. Desde una oportunidad queda ligada a ella; desde «Mis tareas» (`oportunidadId` nulo) puede elegirse
 * una oportunidad en el formulario o quedar libre.
 */
export async function crearTarea(
  oportunidadId: string | null,
  _previo: EstadoTarea,
  datos: FormData,
): Promise<EstadoTarea> {
  await obtenerSesion();
  const elegida = String(datos.get('oportunidad_id') ?? '');
  if (elegida && !esUuid(elegida)) return { error: 'La oportunidad no es válida.' };
  const ligada = oportunidadId ?? (elegida || null);
  const leido = leerTarea(datos);
  if ('error' in leido) return { error: leido.error };
  const subtareas = subtareasNuevasSchema.safeParse(json(datos.get('subtareas'), '[]'));
  if (!subtareas.success) return { error: subtareas.error.issues[0]?.message ?? 'Revisa las subtareas.' };
  const supabase = await clienteServidor();
  // responsable_id lo pone la base (auth.uid()): una tarea siempre es de quien la crea.
  const { data, error } = await supabase
    .from('tareas')
    .insert({ oportunidad_id: ligada, ...leido.fila })
    .select('id')
    .single();
  if (error || !data) return { error: 'No se pudo guardar la tarea.' };
  if (await guardarAvisos(data.id as string, leido.avisos))
    return { error: 'La tarea se guardó, pero no sus avisos.' };
  if (subtareas.data.length > 0) {
    const { error: e } = await supabase
      .from('tareas')
      .insert(subtareas.data.map((titulo) => ({ tarea_padre_id: data.id, titulo })));
    if (e) return { error: 'La tarea se guardó, pero no sus subtareas.' };
  }
  await borrarBorrador(oportunidadId, 'tarea');
  refrescar(ligada);
  return { ok: leido.fila.vence_en ? 'Tarea programada.' : 'Tarea creada.' };
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

/** Mueve una tarea a otra etapa de su pipeline; la base ajusta el estado (la final la completa). */
export async function moverTareaAEtapa(id: string, etapaId: string): Promise<EstadoTarea> {
  await obtenerSesion();
  const supabase = await clienteServidor();
  const { data, error } = await supabase
    .from('tareas')
    .update({ etapa_id: etapaId })
    .eq('id', id)
    .is('tarea_padre_id', null)
    .select('oportunidad_id')
    .maybeSingle();
  if (error || !data) return { error: 'No se pudo mover la tarea.' };
  refrescar(data.oportunidad_id as string | null);
  return { ok: 'Tarea movida.' };
}

/** Guarda el nuevo orden de las subtareas de una tarea (lista completa de ids, en orden). */
export async function reordenarSubtareas(padreId: string, ids: string[]): Promise<EstadoTarea> {
  await obtenerSesion();
  if (ids.length > 100 || ids.some((i) => typeof i !== 'string')) return { error: 'Orden no válido.' };
  const supabase = await clienteServidor();
  const resultados = await Promise.all(
    ids.map((id, orden) =>
      supabase.from('tareas').update({ orden }).eq('id', id).eq('tarea_padre_id', padreId),
    ),
  );
  if (resultados.some((r) => r.error)) return { error: 'No se pudo guardar el orden.' };
  refrescar();
  return { ok: 'Orden guardado.' };
}

/** Agrega una subtarea rápida (sólo el título, como en Asana); la oportunidad la hereda de la principal. */
export async function crearSubtarea(padreId: string, titulo: string): Promise<EstadoTarea> {
  await obtenerSesion();
  const leido = tituloSubtareaSchema.safeParse(titulo);
  if (!leido.success) return { error: leido.error.issues[0]?.message };
  const supabase = await clienteServidor();
  const { data, error } = await supabase
    .from('tareas')
    .insert({ tarea_padre_id: padreId, titulo: leido.data })
    .select('oportunidad_id')
    .single();
  if (error || !data) return { error: 'No se pudo agregar la subtarea.' };
  refrescar(data.oportunidad_id as string);
  return { ok: 'Subtarea agregada.' };
}

/** Edita una subtarea: título, fecha opcional, avisos y notas. */
export async function actualizarSubtarea(
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
    .not('tarea_padre_id', 'is', null)
    .select('oportunidad_id')
    .maybeSingle();
  if (error || !data) return { error: 'No se pudo guardar la subtarea.' };
  if (await guardarAvisos(id, leido.avisos)) return { error: 'La subtarea se guardó, pero no sus avisos.' };
  refrescar(data.oportunidad_id as string);
  return { ok: 'Subtarea actualizada.' };
}

export async function cambiarEstadoTarea(id: string, estado: Etapa): Promise<EstadoTarea> {
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
    .in('tarea.estado', ESTADOS_ABIERTOS)
    .lte('aviso_en', hasta)
    .order('aviso_en');
  type Fila = {
    id: string;
    aviso_en: string;
    tarea: {
      id: string;
      titulo: string;
      vence_en: string;
      oportunidad_id: string | null;
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
