'use server';

import { dispositivoDeAgente } from '@celmi/core';
import { headers } from 'next/headers';
import { endpointPermitido, leerPreferenciasAvisos, type PreferenciasAvisos } from './avisos';
import { contarPorAutorizar, listarNotificaciones, type Notificacion } from './datos';
import { obtenerSesion } from './sesion';
import { clienteAdmin } from './supabase/admin';
import { clienteServidor } from './supabase/servidor';

/** Guarda las preferencias de avisos del propio perfil (0035) y devuelve cómo quedaron. */
export async function guardarMisAvisos(
  cambios: Partial<PreferenciasAvisos>,
): Promise<{ preferencias?: PreferenciasAvisos; error?: string }> {
  await obtenerSesion();
  const limpio = Object.fromEntries(
    Object.entries(cambios).filter(
      ([k, v]) => ['cotizaciones', 'autorizacion', 'sonido', 'windows'].includes(k) && typeof v === 'boolean',
    ),
  );
  const supabase = await clienteServidor();
  const { data, error } = await supabase.rpc('guardar_mis_avisos', { avisos: limpio });
  if (error) return { error: 'No se pudieron guardar tus preferencias.' };
  return { preferencias: leerPreferenciasAvisos({ avisos: data }) };
}

/** Avisos recientes (al reconectar el tiempo real se recupera lo que pudo llegar sin conexión). */
export async function avisosRecientes(): Promise<Notificacion[] | null> {
  const sesion = await obtenerSesion();
  if (sesion.demo) return null;
  try {
    return await listarNotificaciones();
  } catch {
    return null;
  }
}

/** Número de revisiones por autorizar y cancelaciones pendientes (contador del menú, en vivo). */
export async function contarAutorizacionesEnVivo(): Promise<number | null> {
  const sesion = await obtenerSesion();
  if (sesion.demo || !sesion.permisos.has('utilidad.autorizar')) return null;
  try {
    return await contarPorAutorizar();
  } catch {
    return null;
  }
}

const B64URL = /^[A-Za-z0-9_-]+$/;

/**
 * Activa los avisos de Windows con el sitio cerrado en este navegador (Web Push). Sólo se aceptan los servicios de
 * envío de los navegadores conocidos.
 */
export async function registrarSuscripcion(s: { endpoint: string; p256dh: string; auth: string }): Promise<{
  error?: string;
}> {
  const sesion = await obtenerSesion();
  if (sesion.demo) return { error: 'No disponible en modo demostración.' };
  if (
    typeof s?.endpoint !== 'string' ||
    s.endpoint.length > 1000 ||
    !endpointPermitido(s.endpoint) ||
    typeof s.p256dh !== 'string' ||
    !B64URL.test(s.p256dh) ||
    typeof s.auth !== 'string' ||
    !B64URL.test(s.auth)
  )
    return { error: 'Este navegador no es compatible con los avisos de Windows.' };
  const dispositivo = dispositivoDeAgente((await headers()).get('user-agent')).slice(0, 120);
  const supabase = await clienteServidor();
  const fila = { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth, dispositivo };
  let { error } = await supabase.from('suscripciones_push').insert(fila);
  if (error?.code === '23505') {
    // El mismo navegador ya estaba suscrito (quizá con otra cuenta): ahora pertenece a quien inició sesión.
    // Tener el endpoint prueba que se trata de este navegador.
    await clienteAdmin().from('suscripciones_push').delete().eq('endpoint', s.endpoint);
    ({ error } = await supabase.from('suscripciones_push').insert(fila));
  }
  return error ? { error: 'No se pudieron activar los avisos de Windows.' } : {};
}

/** Desactiva los avisos de Windows con el sitio cerrado en este navegador. */
export async function quitarSuscripcion(endpoint: string): Promise<{ error?: string }> {
  await obtenerSesion();
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return {};
  const supabase = await clienteServidor();
  const { error } = await supabase.from('suscripciones_push').delete().eq('endpoint', endpoint);
  return error ? { error: 'No se pudieron desactivar los avisos de Windows.' } : {};
}
