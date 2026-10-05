'use server';

import { borradorNotaSchema, borradorTareaSchema, leerContenido } from '@celmi/validation';
import { revalidatePath } from 'next/cache';
import { obtenerSesion } from './sesion';
import { clienteServidor } from './supabase/servidor';

export type TipoBorrador = 'tarea' | 'nota';

/** Arma los datos del borrador a partir del formulario a medias (validado, sin exigir que esté completo). */
function leerBorrador(tipo: TipoBorrador, datos: FormData) {
  const campo = tipo === 'tarea' ? 'notas' : 'contenido';
  const texto = leerContenido(datos.get(campo));
  if (!texto.ok) return { error: texto.error } as const;
  if (tipo === 'nota') {
    const r = borradorNotaSchema.safeParse({ tipo: datos.get('tipo') ?? undefined });
    if (!r.success) return { error: 'El borrador no es válido.' } as const;
    return { datos: { ...r.data, contenido: texto.doc } } as const;
  }
  let avisos: unknown = [];
  let subtareas: unknown = [];
  try {
    avisos = JSON.parse(String(datos.get('avisos') ?? '[]'));
    subtareas = JSON.parse(String(datos.get('subtareas') ?? '[]'));
  } catch {
    return { error: 'El borrador no es válido.' } as const;
  }
  const r = borradorTareaSchema.safeParse({
    titulo: String(datos.get('titulo') ?? ''),
    fecha: String(datos.get('fecha') ?? ''),
    hora: String(datos.get('hora') ?? ''),
    avisos,
    subtareas,
    con_fecha: datos.get('con_fecha') !== 'no',
    oportunidad: String(datos.get('oportunidad_id') ?? ''),
  });
  if (!r.success) return { error: 'El borrador no es válido.' } as const;
  return { datos: { ...r.data, notas: texto.doc } } as const;
}

/** Ruta que muestra los borradores de esa oportunidad (o «Mis tareas» si no hay). */
const rutaDe = (oportunidadId: string | null) =>
  oportunidadId ? `/oportunidades/${oportunidadId}` : '/tareas';

export async function guardarBorrador(
  oportunidadId: string | null,
  tipo: TipoBorrador,
  datos: FormData,
): Promise<{ error?: string; ok?: string }> {
  await obtenerSesion();
  const leido = leerBorrador(tipo, datos);
  if ('error' in leido) return { error: leido.error };
  const supabase = await clienteServidor();
  // usuario_id lo pone la base (auth.uid()): un borrador siempre es de quien lo guarda.
  const { error } = await supabase
    .from('borradores')
    .upsert(
      { oportunidad_id: oportunidadId, tipo, datos: leido.datos },
      { onConflict: 'usuario_id,oportunidad_id,tipo' },
    );
  if (error) return { error: 'No se pudo guardar el borrador.' };
  revalidatePath(rutaDe(oportunidadId));
  return { ok: 'Borrador guardado.' };
}

export async function descartarBorrador(oportunidadId: string | null, tipo: TipoBorrador) {
  await obtenerSesion();
  await borrarBorrador(oportunidadId, tipo);
  revalidatePath(rutaDe(oportunidadId));
}

/** También se usa al guardar el registro definitivo. */
export async function borrarBorrador(oportunidadId: string | null, tipo: TipoBorrador) {
  const supabase = await clienteServidor();
  const q = supabase.from('borradores').delete().eq('tipo', tipo);
  await (oportunidadId ? q.eq('oportunidad_id', oportunidadId) : q.is('oportunidad_id', null));
}
