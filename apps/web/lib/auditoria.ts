import {
  agruparAuditoria,
  type Acceso,
  type AccionAuditoria,
  type FilaAuditoria,
  type NombresAuditoria,
} from '@celmi/core';
import { clienteServidor } from './supabase/servidor';

/*
 * Auditoría (Fase 7, 2026-10-13). Todo pasa por la sesión del usuario: la consulta completa exige auditoria.ver en
 * la base (`public.auditoria_eventos`) y el historial de una cotización exige acceso a ella y omite lo sensible
 * (`public.historial_cotizacion`). No se exporta (decisión 2026-10-13).
 */

/** Acción lista para el navegador: sin las filas crudas (el detalle ya va en `cambios`). */
export type AccionVista = Omit<AccionAuditoria, 'filas'> & { tablas: string[] };

interface FilaSql {
  id: number;
  en: string;
  usuario_id: string | null;
  usuario: string | null;
  tabla: string;
  registro_id: string;
  accion: FilaAuditoria['accion'];
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
  revision_id: string | null;
  revision_numero: number | null;
  cotizacion_id: string | null;
  folio: string | null;
  oportunidad_id: string | null;
  oportunidad: string | null;
  cliente_id: string | null;
  cliente: string | null;
  etiqueta: string | null;
  sensible: boolean;
}

function aFila(f: FilaSql): FilaAuditoria {
  return {
    id: f.id,
    en: f.en,
    usuarioId: f.usuario_id,
    usuario: f.usuario,
    tabla: f.tabla,
    registroId: f.registro_id,
    accion: f.accion,
    antes: f.antes,
    despues: f.despues,
    revisionId: f.revision_id,
    revisionNumero: f.revision_numero,
    cotizacionId: f.cotizacion_id,
    folio: f.folio,
    oportunidadId: f.oportunidad_id,
    oportunidad: f.oportunidad,
    clienteId: f.cliente_id,
    cliente: f.cliente,
    etiqueta: f.etiqueta,
    sensible: f.sensible,
  };
}

const aVista = ({ filas, ...a }: AccionAuditoria): AccionVista => ({
  ...a,
  tablas: [...new Set(filas.map((f) => f.tabla))],
});

function exigir<T>(r: { data: T; error: { code?: string; message: string } | null }, que: string): T {
  if (r.error) {
    console.error(`[auditoria] ${que}: ${r.error.code ?? ''} ${r.error.message}`);
    throw new Error(`No se pudo consultar ${que} (${r.error.code ?? 'error'}).`);
  }
  return r.data;
}

const mapa = (filas: { id: string; nombre: string }[] | null) =>
  Object.fromEntries((filas ?? []).map((x) => [x.id, x.nombre]));

/** Nombres de personas, roles y catálogos para mostrar los identificadores. */
export async function nombresAuditoria(): Promise<
  NombresAuditoria & { lista: { id: string; nombre: string }[] }
> {
  const supabase = await clienteServidor();
  const [perfiles, roles, mayoristas, estados, financieras] = await Promise.all([
    supabase.from('perfiles').select('id, nombre').order('nombre'),
    supabase.from('roles').select('id, nombre'),
    supabase.from('mayoristas').select('id, nombre'),
    supabase.from('estados_oportunidad').select('id, nombre'),
    supabase.from('financieras').select('id, nombre'),
  ]);
  const lista = exigir(perfiles, 'las personas') ?? [];
  return {
    lista,
    perfiles: mapa(lista),
    roles: mapa(exigir(roles, 'los roles')),
    mayoristas: mapa(exigir(mayoristas, 'los mayoristas')),
    estados: mapa(exigir(estados, 'los estados')),
    financieras: mapa(exigir(financieras, 'las financieras')),
  };
}

export interface FiltrosAuditoria {
  desde?: string;
  antes_de?: string;
  usuario?: string;
  tablas?: readonly string[];
  texto?: string;
  sensible?: boolean;
  cotizacion?: string;
  oportunidad?: string;
  cliente?: string;
  perfil?: string;
}

/** Fecha ISO de hace `dias` días. */
export const haceDias = (dias: number) => new Date(Date.now() - dias * 24 * 3600 * 1000).toISOString();

export const ACCIONES_POR_PAGINA = 40;

/** Acciones (más recientes primero) y, si hay más, la hora desde la cual pedir la siguiente página. */
export async function consultarAuditoria(
  filtros: FiltrosAuditoria,
  nombres: NombresAuditoria,
  limite = ACCIONES_POR_PAGINA,
): Promise<{ acciones: AccionVista[]; siguiente: string | null }> {
  const supabase = await clienteServidor();
  // Se pide una de más para saber si hay otra página.
  const r = await supabase.rpc('auditoria_eventos', { filtros, limite: limite + 1 });
  const filas = ((exigir(r, 'la auditoría') ?? []) as FilaSql[]).map(aFila);
  const acciones = agruparAuditoria(filas, nombres);
  const hayMas = acciones.length > limite;
  const pagina = acciones.slice(0, limite);
  return { acciones: pagina.map(aVista), siguiente: hayMas ? (pagina.at(-1)?.en ?? null) : null };
}

export interface Expediente {
  tipo: 'cotizacion' | 'oportunidad' | 'cliente' | 'usuario';
  id: string;
  titulo: string;
  detalle: string | null;
  eventos: number;
  ultimo: string;
}

export async function consultarExpedientes(texto: string | null): Promise<Expediente[]> {
  const supabase = await clienteServidor();
  const r = await supabase.rpc('auditoria_expedientes', { texto });
  return (exigir(r, 'los expedientes') ?? []) as Expediente[];
}

/** Actividad de una cotización para quien tiene acceso a ella (sin utilidad ni costos si no los puede ver). */
export async function historialCotizacion(cotizacionId: string): Promise<AccionVista[]> {
  const supabase = await clienteServidor();
  const [r, nombres] = await Promise.all([
    supabase.rpc('historial_cotizacion', { cotizacion: cotizacionId }),
    nombresAuditoria(),
  ]);
  const filas = ((exigir(r, 'la actividad de la cotización') ?? []) as FilaSql[]).map(aFila);
  return agruparAuditoria(filas, nombres).map(aVista);
}

/** Accesos de los últimos `dias` días (sólo con auditoria.ver, por las reglas de la tabla). */
export async function consultarAccesos(dias = 60): Promise<Acceso[]> {
  const supabase = await clienteServidor();
  const desde = haceDias(dias);
  const r = await supabase
    .from('accesos')
    .select('id, en, usuario_id, correo, evento, ip, agente, realizado_por')
    .gte('en', desde)
    .order('en', { ascending: false })
    .limit(2000);
  return (
    (exigir(r, 'los accesos') ?? []) as {
      id: number;
      en: string;
      usuario_id: string | null;
      correo: string | null;
      evento: string;
      ip: string | null;
      agente: string | null;
      realizado_por: string | null;
    }[]
  ).map((a) => ({
    id: a.id,
    en: a.en,
    usuarioId: a.usuario_id,
    correo: a.correo,
    evento: a.evento,
    ip: a.ip,
    agente: a.agente,
    realizadoPor: a.realizado_por,
  }));
}
