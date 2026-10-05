'use server';

import { leerContenido } from '@celmi/validation';
import { revalidatePath } from 'next/cache';
import { exigirPermiso } from '@/lib/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';

export interface Resultado {
  error?: string;
  ok?: string;
}

const refrescar = () => {
  revalidatePath('/catalogos');
  revalidatePath('/cotizaciones', 'layout');
};

/** Alta o cambio de una condición del catálogo (texto con formato validado contra la lista blanca). */
export async function guardarCondicion(
  id: string | null,
  nombre: string,
  contenido: string,
): Promise<Resultado> {
  await exigirPermiso('catalogos.administrar');
  const n = nombre.trim();
  if (n.length < 1 || n.length > 120) return { error: 'Escribe un nombre (máx. 120 caracteres).' };
  const doc = leerContenido(contenido);
  if (!doc.ok) return { error: doc.error };
  if (!doc.doc) return { error: 'Escribe el texto de la condición.' };
  const supabase = await clienteServidor();
  if (id) {
    const { error } = await supabase
      .from('condiciones_comerciales')
      .update({ nombre: n, contenido: doc.doc })
      .eq('id', id);
    if (error) return { error: 'No se pudo guardar la condición.' };
  } else {
    const { data: ultima } = await supabase
      .from('condiciones_comerciales')
      .select('orden')
      .order('orden', { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await supabase
      .from('condiciones_comerciales')
      .insert({ nombre: n, contenido: doc.doc, orden: ((ultima?.orden as number | undefined) ?? 0) + 1 });
    if (error) return { error: 'No se pudo agregar la condición.' };
  }
  refrescar();
  return { ok: 'Condición guardada.' };
}

export async function cambiarCondicionActiva(id: string, activa: boolean): Promise<Resultado> {
  await exigirPermiso('catalogos.administrar');
  const supabase = await clienteServidor();
  const { error } = await supabase.from('condiciones_comerciales').update({ activa }).eq('id', id);
  if (error) return { error: 'No se pudo actualizar.' };
  refrescar();
  return { ok: activa ? 'Condición activada.' : 'Condición desactivada.' };
}

/** Orden en que se ofrecen al cotizar (lista completa de ids). */
export async function reordenarCondiciones(ids: string[]): Promise<Resultado> {
  await exigirPermiso('catalogos.administrar');
  if (ids.length > 500) return { error: 'Orden no válido.' };
  const supabase = await clienteServidor();
  const r = await Promise.all(
    ids.map((id, i) =>
      supabase
        .from('condiciones_comerciales')
        .update({ orden: i + 1 })
        .eq('id', id),
    ),
  );
  if (r.some((x) => x.error)) return { error: 'No se pudo guardar el orden.' };
  refrescar();
  return { ok: 'Orden guardado.' };
}
