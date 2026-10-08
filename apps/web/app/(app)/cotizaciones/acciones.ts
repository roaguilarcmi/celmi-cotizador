'use server';

import {
  condicionesRevisionSchema,
  financiamientoSchema,
  normalizarContenido,
  propuestasCotizacionSchema,
  datosAutorizacionSchema,
  esquemaRevisionSchema,
  tiposCambioAutorizacionSchema,
  utilidadesAutorizacionSchema,
} from '@celmi/validation';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  aEscalado,
  centavosADecimal,
  ESCALA_DINERO,
  formatearMXN,
  numeroDePagos,
  tasaAnualNominal,
  valorResidual,
} from '@celmi/core';
import { corridaDe, monedasExtranjeras, presentacionAutorizada, transaccionPorPartida } from '@/lib/corrida';
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
  // El T.C. ya no viaja con la partida: lo fija quien autoriza (0027).
  const propuestas = leido.data;
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
  condiciones: unknown,
): Promise<Resultado> {
  await obtenerSesion();
  const lista = Array.isArray(condiciones)
    ? condiciones.map((c: { contenido?: unknown }) => ({
        ...c,
        contenido: normalizarContenido(c?.contenido),
      }))
    : condiciones;
  const leido = condicionesRevisionSchema.safeParse(lista);
  if (!leido.success) return { error: leido.error.issues[0]?.message ?? 'Revisa las condiciones.' };
  // La vigencia ya no se captura aquí: la fija quien autoriza en la corrida (0027).
  const supabase = await clienteServidor();
  const r = await supabase.rpc('guardar_condiciones', { revision: revisionId, condiciones: leido.data });
  if (r.error) return { error: mensajeDe(r.error, 'No se pudieron guardar las condiciones.') };
  refrescar(cotizacionId);
  return { ok: 'Condiciones guardadas.' };
}

/** Propuesta de financiamiento (después de autorizar precios; no requiere otra autorización). */
/**
 * Opciones de financiamiento (decisiones 2026-10-07). El servidor no confía en lo calculado por el navegador: toma el
 * valor de los equipos de los precios autorizados (subtotal sin IVA de cada propuesta, con los adicionales que se
 * suman), calcula el valor residual que falte (Full PayOut) y la tasa anual nominal con pagos vencidos.
 */
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
  const revision = await obtenerRevision(revisionId);
  if (!revision || revision.cotizacion_id !== cotizacionId) return { error: 'La revisión no existe.' };
  const { data: cot } = await supabase
    .from('cotizaciones')
    .select('oportunidad:oportunidades(tipo)')
    .eq('id', cotizacionId)
    .maybeSingle();
  const tipo = (cot?.oportunidad as { tipo?: string } | null)?.tipo ?? 'arrendamiento';
  const presentadas = presentacionAutorizada(revision);
  if (!presentadas) return { error: 'El financiamiento se captura cuando los precios ya están autorizados.' };
  const valorDe = new Map(presentadas.map((p) => [p.id, p.totales.subtotal]));

  const { data: financieras } = await supabase.from('financieras').select('id, nombre, aseguradoras');
  const aseguradorasDe = new Map(
    ((financieras ?? []) as { id: string; aseguradoras: string[] }[]).map((x) => [x.id, x.aseguradoras]),
  );
  const centavos = (v: string) => (v ? aEscalado(v, ESCALA_DINERO) : 0n);

  const salida: Record<string, unknown>[] = [];
  for (const [i, f] of leido.data.entries()) {
    const n = i + 1;
    const valor = valorDe.get(f.propuesta_id);
    if (valor === undefined) return { error: `Opción ${n}: la propuesta no es de esta revisión.` };
    const aseguradoras = aseguradorasDe.get(f.financiera_id);
    if (!aseguradoras) return { error: `Opción ${n}: la financiera no existe.` };
    if (f.aseguradora && !aseguradoras.includes(f.aseguradora))
      return { error: `Opción ${n}: la aseguradora no es de esa financiera.` };
    // Crédito simple: no hay tipo de arrendamiento ni residual (decisión 2026-10-07).
    const tipoArrendamiento = tipo === 'arrendamiento' ? f.tipo_arrendamiento : null;
    if (tipo === 'arrendamiento' && !tipoArrendamiento)
      return { error: `Opción ${n}: elige el tipo de arrendamiento.` };
    let pagos: number;
    try {
      pagos = numeroDePagos(f.plazo_meses, f.frecuencia);
    } catch (e) {
      return { error: `Opción ${n}: ${(e as Error).message}.` };
    }
    let residual: { porcentaje: string; monto: bigint } | null = null;
    if (tipoArrendamiento === 'fpo') {
      if (!f.residual_capturado || !f.residual_valor)
        return { error: `Opción ${n}: en Full PayOut captura el valor residual (en % o en monto).` };
      if (f.residual_capturado === 'monto' && !/^\d+(\.\d{1,2})?$/.test(f.residual_valor))
        return { error: `Opción ${n}: el valor residual en monto lleva máximo 2 decimales.` };
      try {
        residual = valorResidual(
          valor,
          f.residual_capturado === 'pct'
            ? { porcentaje: f.residual_valor }
            : { monto: aEscalado(f.residual_valor, ESCALA_DINERO) },
        );
      } catch (e) {
        return { error: `Opción ${n}: ${(e as Error).message}.` };
      }
    }
    const pagoPorPeriodo = centavos(f.pago) + centavos(f.pago_seguro);
    const tasa = tasaAnualNominal({ valor, pagoPorPeriodo, pagos, frecuencia: f.frecuencia });
    // Tasa negativa: los pagos no alcanzan el valor de los equipos. Se explica en lugar del error de la base.
    if (tasa !== null && Number(tasa) < 0)
      return {
        error: `Opción ${n}: con esos pagos la tasa sale negativa (${Number(tasa).toFixed(2)} %). ${pagos} pagos de ${formatearMXN(pagoPorPeriodo)} (equipos + seguro) suman ${formatearMXN(pagoPorPeriodo * BigInt(pagos))}, menos que el valor de los equipos (${formatearMXN(valor)}). Revisa la mensualidad, el seguro o el plazo.`,
      };
    salida.push({
      propuesta_id: f.propuesta_id,
      financiera_id: f.financiera_id,
      aseguradora: f.aseguradora,
      folio_financiera: f.folio_financiera,
      tipo_arrendamiento: tipoArrendamiento ?? '',
      plazo_meses: f.plazo_meses,
      frecuencia: f.frecuencia,
      valor_equipos: centavosADecimal(valor),
      residual_capturado: residual ? f.residual_capturado : '',
      residual_pct: residual?.porcentaje ?? '',
      valor_residual: residual ? centavosADecimal(residual.monto) : '',
      gastos_iniciales: f.gastos_iniciales,
      pago: f.pago,
      pago_seguro: f.pago_seguro,
      factor: f.factor,
      tasa_interes: tasa ?? '',
      vigencia_financiera: f.vigencia_financiera,
      fecha_emision_financiera: f.fecha_emision_financiera,
    });
  }
  const { error } = await supabase.rpc('guardar_financiamiento', { revision: revisionId, filas: salida });
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
  datos: unknown = {},
): Promise<Resultado> {
  await exigirPermiso('utilidad.autorizar');
  const leido = utilidadesAutorizacionSchema.safeParse(utilidades);
  if (!leido.success) return { error: ERROR_UTILIDAD };
  const tc = tiposCambioAutorizacionSchema.safeParse(tiposCambio);
  if (!tc.success) return { error: ERROR_TC };
  const extra = datosAutorizacionSchema.safeParse(datos);
  if (!extra.success)
    return { error: extra.error.issues[0]?.message ?? 'Revisa el anticipo y la transaccionalidad.' };
  const revision = await obtenerRevision(revisionId);
  if (!revision || revision.cotizacion_id !== cotizacionId) return { error: 'La revisión no existe.' };
  const transacciones = transaccionPorPartida(
    revision,
    extra.data.transaccion_pct,
    extra.data.transaccion_alcance,
  );
  const partidas = Object.entries(leido.data).map(([partida_id, utilidad_pct]) => ({
    partida_id,
    utilidad_pct,
    transaccion_pct: transacciones[partida_id] ?? '0',
  }));
  const supabase = await clienteServidor();
  const { error } = await supabase.rpc('guardar_utilidades', {
    revision: revisionId,
    partidas,
    tipos_cambio: tc.data,
    datos: extra.data,
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
  datos: unknown = {},
): Promise<Resultado> {
  await exigirPermiso('utilidad.autorizar');
  const leido = utilidadesAutorizacionSchema.safeParse(utilidades);
  if (!leido.success) return { error: ERROR_UTILIDAD };
  const tc = tiposCambioAutorizacionSchema.safeParse(tiposCambio);
  if (!tc.success) return { error: ERROR_TC };
  if (typeof comentario !== 'string' || comentario.length > 2000)
    return { error: 'La nota es demasiado larga.' };
  const extra = datosAutorizacionSchema.safeParse(datos);
  if (!extra.success)
    return { error: extra.error.issues[0]?.message ?? 'Revisa el anticipo y la transaccionalidad.' };
  const revision = await obtenerRevision(revisionId);
  if (!revision || revision.cotizacion_id !== cotizacionId) return { error: 'La revisión no existe.' };
  if (revision.estado !== 'pendiente_autorizacion')
    return { error: 'Esta revisión ya no espera autorización.' };
  // Cada moneda extranjera de la revisión necesita su T.C. (sólo esas: en pesos no se pide).
  const faltan = monedasExtranjeras(revision).filter((m) => !tc.data[m]);
  if (faltan.length) return { error: `Indica el tipo de cambio de ${faltan.join(', ')}.` };
  if (revision.esquema === 'adquisicion' && !extra.data.anticipo_pct)
    return { error: 'Indica el porcentaje de anticipo.' };
  if (Number(extra.data.transaccion_pct) > 0 && !extra.data.transaccion_alcance)
    return {
      error: 'Indica si la transaccionalidad va en todas las partidas o sólo en las de otro proveedor.',
    };
  const transacciones = transaccionPorPartida(
    revision,
    extra.data.transaccion_pct,
    extra.data.transaccion_alcance,
  );
  const utilidad = leido.data;
  const corrida = corridaDe(revision, (id) => utilidad[id] ?? '', tc.data, transacciones);
  if (!corrida) return { error: 'Falta la utilidad de alguna partida o hay un dato no válido.' };
  const partidas = [...corrida.partidas].map(([partida_id, r]) => ({
    partida_id,
    utilidad_pct: utilidad[partida_id],
    transaccion_pct: transacciones[partida_id] ?? '0',
    precio_unitario: centavosADecimal(r.precioUnitario),
  }));
  const supabase = await clienteServidor();
  const { error } = await supabase.rpc('autorizar_revision', {
    revision: revisionId,
    partidas,
    tipos_cambio: tc.data,
    comentario: comentario.trim(),
    datos: extra.data,
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

/**
 * Retirar para corregir (0027): quien autoriza regresa la revisión a borrador con un motivo; la base avisa a quien la
 * capturó y al ejecutivo de la oportunidad.
 */
export async function retirarParaCorregir(
  revisionId: string,
  cotizacionId: string,
  motivo: string,
): Promise<Resultado> {
  await exigirPermiso('utilidad.autorizar');
  const texto = typeof motivo === 'string' ? motivo.trim() : '';
  if (texto.length < 5) return { error: 'Explica qué hay que corregir.' };
  if (texto.length > 2000) return { error: 'El motivo es demasiado largo.' };
  const supabase = await clienteServidor();
  const { error } = await supabase.rpc('retirar_revision', { revision: revisionId, motivo: texto });
  if (error) return { error: mensajeDe(error, 'No se pudo retirar.') };
  refrescarBandeja(cotizacionId);
  return { ok: 'Retirada. Se avisó al capturista y al ejecutivo.' };
}

// ───────────── Revisiones (Fase 3D) ─────────────

/**
 * Nueva Rev a partir de la autorizada: la base copia propuestas, partidas, costos, adicionales y repartos (con su
 * origen); en una mejora de precio el costo actual pasa a «Precio anterior». Vuelve a pasar por autorización.
 */
export async function crearNuevaRevision(
  cotizacionId: string,
  motivo: string,
  razon: string,
  visibilidad: string,
): Promise<Resultado> {
  await obtenerSesion();
  if (!['solicitud_cliente', 'mejora_precio', 'error_captura'].includes(motivo))
    return { error: 'Elige el motivo.' };
  if (typeof razon !== 'string' || razon.trim().length < 5)
    return { error: 'Explica la razón de la revisión (al menos unas palabras).' };
  if (razon.length > 1000) return { error: 'La razón es demasiado larga (máximo 1,000 caracteres).' };
  if (!['nuevo_folio', 'visible', 'interna'].includes(visibilidad))
    return { error: 'Elige cómo se presenta la revisión.' };
  const supabase = await clienteServidor();
  const { data: id, error } = await supabase.rpc('crear_revision', {
    cotizacion: cotizacionId,
    motivo,
    razon: razon.trim(),
    visibilidad,
  });
  if (error || typeof id !== 'string')
    return {
      error: error ? mensajeDe(error, 'No se pudo crear la revisión.') : 'No se pudo crear la revisión.',
    };
  const { data: rev } = await supabase.from('revisiones').select('numero').eq('id', id).maybeSingle();
  refrescar(cotizacionId);
  redirect(`/cotizaciones/${cotizacionId}?rev=${rev?.numero ?? ''}&paso=partidas`);
}

/** Descarta una Rev que nunca se autorizó (la más reciente; la original no). La auditoría conserva lo descartado. */
export async function descartarRevision(revisionId: string, cotizacionId: string): Promise<Resultado> {
  await obtenerSesion();
  const supabase = await clienteServidor();
  const { data, error } = await supabase.from('revisiones').delete().eq('id', revisionId).select('id');
  if (error) return { error: mensajeDe(error, 'No se pudo descartar la revisión.') };
  if (!data?.length) return { error: 'Esta revisión ya no se puede descartar.' };
  refrescar(cotizacionId);
  redirect(`/cotizaciones/${cotizacionId}`);
}

/**
 * Esquema de la cotización (Adquisición, Arrendamiento o Crédito simple) y, en arrendamiento, el mayorista con el que
 * se trabaja (decisión 2026-10-07). Sólo en borrador; la base lo vuelve a exigir.
 */
export async function guardarEsquemaRevision(
  revisionId: string,
  cotizacionId: string,
  datos: unknown,
): Promise<Resultado> {
  await obtenerSesion();
  const leido = esquemaRevisionSchema.safeParse(datos);
  if (!leido.success) return { error: 'Elige el esquema de la cotización.' };
  const supabase = await clienteServidor();
  const { data, error } = await supabase
    .from('revisiones')
    .update({
      esquema: leido.data.esquema,
      mayorista_arrendamiento_id:
        leido.data.esquema === 'arrendamiento' ? leido.data.mayorista_arrendamiento_id : null,
    })
    .eq('id', revisionId)
    .select('id');
  if (error) return { error: mensajeDe(error, 'No se pudo guardar el esquema.') };
  if (!data?.length) return { error: 'Esta revisión ya no se puede modificar.' };
  refrescar(cotizacionId);
  return { ok: 'Esquema guardado.' };
}
