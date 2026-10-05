'use server';

import { revalidatePath } from 'next/cache';
import { type ColorEtapa, COLORES_ETAPA, MAX_ETAPAS } from './etapas-tareas';
import { obtenerSesion } from './sesion';
import { clienteServidor } from './supabase/servidor';

/** Etapa tal como la edita la persona: `id` nulo = nueva. La final no se crea ni se quita aquí. */
export interface EtapaEditada {
  id: string | null;
  nombre: string;
  color: ColorEtapa;
}

/**
 * Guarda el pipeline personal completo (decisión 2026-10-05): renombra, recolorea, reordena, agrega y quita etapas
 * abiertas. La final va siempre al último. Al quitar una etapa, la base pasa sus tareas a la primera abierta.
 */
export async function guardarEtapas(
  abiertas: EtapaEditada[],
  final: Omit<EtapaEditada, 'id'> & { id: string },
) {
  await obtenerSesion();
  const todas = [...abiertas, final];
  if (abiertas.length < 1) return { error: 'Debe quedar al menos una etapa abierta.' };
  if (todas.length > MAX_ETAPAS) return { error: `Máximo ${MAX_ETAPAS} etapas.` };
  for (const e of todas) {
    const nombre = e.nombre.trim();
    if (nombre.length < 1 || nombre.length > 40) return { error: 'Cada etapa necesita un nombre (máx. 40).' };
    if (!(e.color in COLORES_ETAPA)) return { error: 'Color no válido.' };
  }
  const nombres = todas.map((e) => e.nombre.trim().toLowerCase());
  if (new Set(nombres).size !== nombres.length) return { error: 'Hay dos etapas con el mismo nombre.' };

  const supabase = await clienteServidor();
  const { data: actuales, error: e0 } = await supabase.from('etapas_tarea').select('id, es_final');
  if (e0 || !actuales) return { error: 'No se pudieron leer tus etapas.' };
  const conservadas = new Set(todas.map((e) => e.id).filter(Boolean));

  // Primero se agregan y actualizan (así nunca se queda sin etapas abiertas), luego se quitan las que sobran.
  for (const [orden, e] of todas.entries()) {
    const fila = { nombre: e.nombre.trim(), color: e.color, orden };
    const r = e.id
      ? await supabase.from('etapas_tarea').update(fila).eq('id', e.id)
      : await supabase.from('etapas_tarea').insert(fila);
    if (r.error) return { error: 'No se pudieron guardar las etapas.' };
  }
  for (const a of actuales) {
    if (a.es_final || conservadas.has(a.id as string)) continue;
    const r = await supabase
      .from('etapas_tarea')
      .delete()
      .eq('id', a.id as string);
    if (r.error) return { error: 'No se pudo quitar una etapa.' };
  }
  revalidatePath('/', 'layout');
  return { ok: 'Etapas guardadas.' };
}
