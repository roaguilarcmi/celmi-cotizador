'use server';

import {
  condicionesRevisionSchema,
  financiamientoSchema,
  normalizarContenido,
  propuestasCotizacionSchema,
  tiposCambioAutorizacionSchema,
  utilidadesAutorizacionSchema,
} from '@celmi/validation';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { centavosADecimal } from '@celmi/core';
import { corridaDe, monedasExtranjeras } from '@/lib/corrida';
import { obtenerRevision } from '@/lib/datos';
import { exigirPermiso, obtenerSesion } from '@/lib/sesion';
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

/** Vigencia y condiciones elegidas (del catálogo, ajustables para esta cotización). */
export async function guardarCondicionesCotizacion(
  revisionId: string,
  cotizacionId: string,
  vigencia: string,
  condiciones: unknown,
): Promise<Resultado> {
  await obtenerSesion();
  if (vigencia && Number.isNaN(Date.parse(vigencia))) return { error: 'La vigencia no es válida.' };
  const lista = Array.isArray(condiciones)
    ? condiciones.map((c: { contenido?: unknown }) => ({
        ...c,
        contenido: normalizarContenido(c?.contenido),
      }))
    : condiciones;
  const leido = condicionesRevisionSchema.safeParse(lista);
  if (!leido.success) return { error: leido.error.issues[0]?.message ?? 'Revisa las condiciones.' };
  const supabase = await clienteServidor();
  const { data, error } = await supabase
    .from('revisiones')
    .update({ vigencia_hasta: vigencia ? new Date(vigencia).toISOString() : null })
    .eq('id', revisionId)
    .select('id');
  if (error) return { error: mensajeDe(error, 'No se pudo guardar la vigencia.') };
  if (!data?.length) return { error: 'Esta revisión ya no se puede modificar.' };
  const r = await supabase.rpc('guardar_condiciones', { revision: revisionId, condiciones: leido.data });
  if (r.error) return { error: mensajeDe(r.error, 'No se pudieron guardar las condiciones.') };
  refrescar(cotizacionId);
  return { ok: 'Condiciones guardadas.' };
}

/** Propuesta de financiamiento (después de autorizar precios; no requiere otra autorización). */
export async function guardarFinanciamiento(
  revisionId: string,
  cotizacionId: string,
  filas: unknown,
): Promise<Resultado> {
  await obtenerSesion();
  const leido = financiamientoSchema.safeParse(filas);
  if (!leido.success) {
    const e = leido.error.issues[0];
    return { error: e?.message ?? 'Revisa el financiamiento.' };
  }
  const supabase = await clienteServidor();
  const { error } = await supabase.rpc('guardar_financiamiento', { revision: revisionId, filas: leido.data });
  if (error) return { error: mensajeDe(error, 'No se pudo guardar el financiamiento.') };
  refrescar(cotizacionId);
  return { ok: 'Financiamiento guardado.' };
}

/**
 * Elimina una cotización mientras no tenga precios autorizados (decisión 2026-10-05); la base lo exige y conserva el
 * registro en la auditoría.
 */
export async function eliminarCotizacion(
  cotizacionId: string,
  oportunidadId: string | null,
): Promise<Resultado> {
  await obtenerSesion();
  const supabase = await clienteServidor();
  const { data, error } = await supabase.from('cotizaciones').delete().eq('id', cotizacionId).select('id');
  if (error) return { error: mensajeDe(error, 'No se pudo eliminar la cotización.') };
  if (!data?.length) return { error: 'Ya no se puede eliminar: tiene precios autorizados.' };
  revalidatePath('/cotizaciones');
  if (oportunidadId) {
    revalidatePath(`/oportunidades/${oportunidadId}`);
    redirect(`/oportunidades/${oportunidadId}`);
  }
  redirect('/cotizaciones');
}

// ───────────── Autorización (Fase 3C) ─────────────

const refrescarBandeja = (cotizacionId: string) => {
  refrescar(cotizacionId);
  revalidatePath('/autorizaciones');
};

const ERROR_UTILIDAD = 'Revisa la utilidad: porcentajes de 0 o más, hasta 4 decimales.';
const ERROR_TC = 'Revisa el tipo de cambio: mayor que cero, hasta 5 decimales.';

/** Guarda el avance (utilidad y T.C.) sin autorizar; sólo mientras espera autorización. */
export async function guardarUtilidades(
  revisionId: string,
  cotizacionId: string,
  utilidades: unknown,
  tiposCambio: unknown,
): Promise<Resultado> {
  await exigirPermiso('utilidad.autorizar');
  const leido = utilidadesAutorizacionSchema.safeParse(utilidades);
  if (!leido.success) return { error: ERROR_UTILIDAD };
  const tc = tiposCambioAutorizacionSchema.safeParse(tiposCambio);
  if (!tc.success) return { error: ERROR_TC };
  const partidas = Object.entries(leido.data).map(([partida_id, utilidad_pct]) => ({
    partida_id,
    utilidad_pct,
  }));
  const supabase = await clienteServidor();
  const { error } = await supabase.rpc('guardar_utilidades', {
    revision: revisionId,
    partidas,
    tipos_cambio: tc.data,
  });
  if (error) return { error: mensajeDe(error, 'No se pudo guardar la utilidad.') };
  refrescarBandeja(cotizacionId);
  return { ok: 'Avance guardado.' };
}

/**
 * Autoriza: el servidor vuelve a leer la revisión y calcula los precios con @celmi/core a partir de la utilidad
 * recibida (nunca acepta precios del navegador); la base los verifica, los registra y autoriza en una transacción.
 */
export async function autorizarRevision(
  revisionId: string,
  cotizacionId: string,
  utilidades: unknown,
  tiposCambio: unknown,
  comentario: string,
): Promise<Resultado> {
  await exigirPermiso('utilidad.autorizar');
  const leido = utilidadesAutorizacionSchema.safeParse(utilidades);
  if (!leido.success) return { error: ERROR_UTILIDAD };
  const tc = tiposCambioAutorizacionSchema.safeParse(tiposCambio);
  if (!tc.success) return { error: ERROR_TC };
  if (typeof comentario !== 'string' || comentario.length > 2000)
    return { error: 'La nota es demasiado larga.' };
  const revision = await obtenerRevision(revisionId);
  if (!revision || revision.cotizacion_id !== cotizacionId) return { error: 'La revisión no existe.' };
  if (revision.estado !== 'pendiente_autorizacion')
    return { error: 'Esta revisión ya no espera autorización.' };
  // Cada moneda extranjera de la revisión necesita su T.C. (sólo esas: en pesos no se pide).
  const faltan = monedasExtranjeras(revision).filter((m) => !tc.data[m]);
  if (faltan.length) return { error: `Indica el tipo de cambio de ${faltan.join(', ')}.` };
  const utilidad = leido.data;
  const corrida = corridaDe(revision, (id) => utilidad[id] ?? '', tc.data);
  if (!corrida) return { error: 'Falta la utilidad de alguna partida o hay un dato no válido.' };
  const partidas = [...corrida.partidas].map(([partida_id, r]) => ({
    partida_id,
    utilidad_pct: utilidad[partida_id],
    precio_unitario: centavosADecimal(r.precioUnitario),
  }));
  const supabase = await clienteServidor();
  const { error } = await supabase.rpc('autorizar_revision', {
    revision: revisionId,
    partidas,
    tipos_cambio: tc.data,
    comentario: comentario.trim(),
  });
  if (error) return { error: mensajeDe(error, 'No se pudo autorizar.') };
  refrescarBandeja(cotizacionId);
  return { ok: 'Precios autorizados y bloqueados.' };
}

/** Rechaza con el motivo (obligatorio): la revisión regresa al ejecutivo para corregirla y reenviarla. */
export async function rechazarRevision(
  revisionId: string,
  cotizacionId: string,
  motivo: string,
): Promise<Resultado> {
  await exigirPermiso('utilidad.autorizar');
  const texto = typeof motivo === 'string' ? motivo.trim() : '';
  if (!texto) return { error: 'Indica el motivo del rechazo.' };
  if (texto.length > 2000) return { error: 'El motivo es demasiado largo.' };
  const supabase = await clienteServidor();
  const { data, error } = await supabase
    .from('revisiones')
    .update({ estado: 'rechazada', comentario_autorizacion: texto })
    .eq('id', revisionId)
    .eq('estado', 'pendiente_autorizacion')
    .select('id');
  if (error) return { error: mensajeDe(error, 'No se pudo rechazar.') };
  if (!data?.length) return { error: 'Esta revisión ya no espera autorización.' };
  refrescarBandeja(cotizacionId);
  return { ok: 'Rechazada. El ejecutivo verá el motivo.' };
}
