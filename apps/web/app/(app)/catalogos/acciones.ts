'use server';

import { revalidatePath } from 'next/cache';
import { catalogoPorTabla, slug } from '@/lib/catalogos';
import { exigirPermiso } from '@/lib/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';

export interface Resultado {
  error?: string;
  ok?: string;
}

/** Valida y convierte los campos según la definición del catálogo (nunca se confía en lo que manda el navegador). */
function leerCampos(tabla: string, valores: Record<string, string | boolean>) {
  const def = catalogoPorTabla(tabla);
  if (!def) throw new Error('Catálogo desconocido');
  const fila: Record<string, unknown> = {};
  for (const c of def.campos) {
    const v = valores[c.id];
    if (c.tipo === 'si_no') {
      fila[c.id] = v === true || v === 'true';
      continue;
    }
    const texto = String(v ?? '').trim();
    if (c.requerido && !texto) return { error: `Falta «${c.etiqueta}».` };
    if (c.tipo === 'entero') {
      if (!/^\d{1,4}$/.test(texto)) return { error: `«${c.etiqueta}» debe ser un número entero.` };
      fila[c.id] = Number(texto);
    } else if (c.tipo === 'lista_enteros') {
      const partes = texto ? texto.split(/[,\s]+/).filter(Boolean) : [];
      if (partes.some((p) => !/^\d{1,3}$/.test(p)))
        return { error: `«${c.etiqueta}»: escribe números separados por comas.` };
      fila[c.id] = [...new Set(partes.map(Number))].sort((a, b) => a - b);
    } else {
      if (texto.length > 120) return { error: `«${c.etiqueta}» es demasiado largo.` };
      fila[c.id] = c.id === 'codigo' || c.id === 'abreviatura' ? texto.toUpperCase() || null : texto;
    }
  }
  if (tabla === 'monedas' && !/^[A-Z]{3}$/.test(String(fila.codigo)))
    return { error: 'El código ISO son 3 letras (MXN, USD, EUR).' };
  return { fila, def };
}

export async function guardarRegistro(
  tabla: string,
  clave: string | null,
  valores: Record<string, string | boolean>,
): Promise<Resultado> {
  await exigirPermiso('catalogos.administrar');
  const leido = leerCampos(tabla, valores);
  if ('error' in leido) return { error: leido.error };
  const { fila, def } = leido;
  const supabase = await clienteServidor();

  if (clave) {
    // La clave de monedas no se cambia una vez creada (la usan las partidas).
    if (def.clave.campo === 'codigo') delete fila.codigo;
    const { error, count } = await supabase
      .from(tabla)
      .update(fila, { count: 'exact' })
      .eq(def.clave.campo, clave);
    if (error || !count) return { error: 'No se pudo guardar el cambio.' };
  } else {
    if (def.clave.tipo === 'slug') {
      const id = slug(String(fila.nombre));
      if (!id) return { error: 'El nombre debe tener letras o números.' };
      fila.id = id;
    }
    const { error } = await supabase.from(tabla).insert(fila);
    if (error?.code === '23505') return { error: 'Ya existe un registro con ese nombre o clave.' };
    if (error) return { error: 'No se pudo agregar el registro.' };
  }
  revalidatePath('/catalogos');
  return { ok: clave ? 'Cambio guardado.' : 'Registro agregado.' };
}

/** Activa o desactiva (no se borra: puede estar en uso). */
export async function cambiarActivo(tabla: string, clave: string, activo: boolean): Promise<Resultado> {
  await exigirPermiso('catalogos.administrar');
  const def = catalogoPorTabla(tabla);
  if (!def) return { error: 'Catálogo desconocido.' };
  const supabase = await clienteServidor();
  const { error, count } = await supabase
    .from(tabla)
    .update({ [def.campoActivo]: activo }, { count: 'exact' })
    .eq(def.clave.campo, clave);
  if (error || !count) return { error: 'No se pudo cambiar el estado.' };
  revalidatePath('/catalogos');
  return { ok: activo ? 'Activado.' : 'Desactivado: ya no aparecerá en las opciones nuevas.' };
}
