'use server';

import { leerContenido, propuestasCotizacionSchema } from '@celmi/validation';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { obtenerSesion } from '@/lib/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';

export interface Resultado {
  error?: string;
  ok?: string;
}

/**
 * Mensaje para la pantalla: las reglas de la base (0014/0015) ya explican el problema en español; cualquier otro
 * error se reporta de forma genérica (sin detalles internos).
 */
const mensajeDe = (error: { code?: string; message: string }, generico: string) =>
  error.code === '23514' || error.code === '42501' || error.code === '22023' ? error.message : generico;

const refrescar = (cotizacionId: string) => {
  revalidatePath(`/cotizaciones/${cotizacionId}`);
  revalidatePath('/cotizaciones');
};

/** Nueva cotización de una oportunidad: revisión original en borrador con una propuesta vacía. */
export async function crearCotizacion(oportunidadId: string): Promise<Resultado> {
  const sesion = await obtenerSesion();
  const supabase = await clienteServidor();
  const { data: cot, error } = await supabase
    .from('cotizaciones')
    .insert({ oportunidad_id: oportunidadId, creado_por: sesion.usuarioId })
    .select('id')
    .single();
  if (error || !cot) return { error: 'No se pudo crear la cotización.' };
  const { data: rev, error: e2 } = await supabase
    .from('revisiones')
    .insert({ cotizacion_id: cot.id, numero: 0, creado_por: sesion.usuarioId })
    .select('id')
    .single();
  if (e2 || !rev) return { error: 'No se pudo crear la revisión.' };
  await supabase.from('propuestas').insert({ revision_id: rev.id, orden: 1, nombre: 'Propuesta 1' });
  revalidatePath(`/oportunidades/${oportunidadId}`);
  redirect(`/cotizaciones/${cot.id}`);
}

/** Guarda propuestas y partidas (con costos) de una revisión en una sola transacción. */
export async function guardarPartidas(
  revisionId: string,
  cotizacionId: string,
  datos: unknown,
): Promise<Resultado> {
  await obtenerSesion();
  const leido = propuestasCotizacionSchema.safeParse(datos);
  if (!leido.success) {
    const e = leido.error.issues[0];
    return {
      error: e ? `${e.message}${e.path.length ? ` (${e.path.join(' › ')})` : ''}` : 'Revisa los datos.',
    };
  }
  // En pesos el tipo de cambio siempre es 1.
  const propuestas = leido.data.map((p) => ({
    ...p,
    partidas: p.partidas.map((pa) => ({
      ...pa,
      costo: pa.costo && pa.costo.moneda === 'MXN' ? { ...pa.costo, tipo_cambio: '1' } : pa.costo,
    })),
  }));
  const supabase = await clienteServidor();
  const { error } = await supabase.rpc('guardar_partidas', { revision: revisionId, propuestas });
  if (error) return { error: mensajeDe(error, 'No se pudieron guardar las partidas.') };
  refrescar(cotizacionId);
  return { ok: 'Cambios guardados.' };
}

/** Vigencia y condiciones comerciales (sólo en borrador o rechazada). */
export async function guardarCondiciones(
  revisionId: string,
  cotizacionId: string,
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  await obtenerSesion();
  const vigencia = String(datos.get('vigencia_hasta') ?? '');
  if (vigencia && Number.isNaN(Date.parse(vigencia))) return { error: 'La vigencia no es válida.' };
  const condiciones = leerContenido(datos.get('condiciones'));
  if (!condiciones.ok) return { error: condiciones.error };
  const supabase = await clienteServidor();
  const { data, error } = await supabase
    .from('revisiones')
    .update({
      vigencia_hasta: vigencia ? new Date(vigencia).toISOString() : null,
      condiciones: condiciones.doc,
    })
    .eq('id', revisionId)
    .select('id');
  if (error) return { error: mensajeDe(error, 'No se pudieron guardar las condiciones.') };
  if (!data?.length) return { error: 'Esta revisión ya no se puede modificar.' };
  refrescar(cotizacionId);
  return { ok: 'Condiciones guardadas.' };
}

/** Enviar a autorización o retirarla a borrador (la base valida la transición). */
export async function cambiarEstadoRevision(
  revisionId: string,
  cotizacionId: string,
  estado: 'pendiente_autorizacion' | 'borrador',
): Promise<Resultado> {
  await obtenerSesion();
  const supabase = await clienteServidor();
  const { data, error } = await supabase
    .from('revisiones')
    .update({ estado })
    .eq('id', revisionId)
    .select('id');
  if (error) return { error: mensajeDe(error, 'No se pudo cambiar el estado.') };
  if (!data?.length) return { error: 'No tienes permiso para cambiar esta revisión.' };
  refrescar(cotizacionId);
  return { ok: estado === 'pendiente_autorizacion' ? 'Enviada a autorización.' : 'Regresó a borrador.' };
}
