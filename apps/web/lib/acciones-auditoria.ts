'use server';

import { historialCotizacion, type AccionVista } from './auditoria';
import { obtenerSesion } from './sesion';

/**
 * Actividad de una cotización (Fase 7 · E): la ve quien tiene acceso a ella; la base omite la utilidad y la
 * transaccionalidad si no tiene utilidad.ver, y los costos si no tiene costos.ver (0034).
 */
export async function cargarActividad(
  cotizacionId: string,
): Promise<{ acciones?: AccionVista[]; error?: string }> {
  const sesion = await obtenerSesion();
  if (sesion.demo) return { acciones: [] };
  if (!/^[0-9a-f-]{36}$/i.test(cotizacionId)) return { error: 'Cotización no válida.' };
  try {
    return { acciones: await historialCotizacion(cotizacionId) };
  } catch {
    return { error: 'No se pudo cargar la actividad. Intenta de nuevo.' };
  }
}
