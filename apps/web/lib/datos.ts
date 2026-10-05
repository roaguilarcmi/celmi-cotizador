import { CONSULTAS } from './consultas';
import { clienteServidor } from './supabase/servidor';

/*
 * Consultas de la Fase 2. Todas usan la sesión del usuario: las reglas RLS de la base deciden qué filas ve
 * cada quien (un ejecutivo sólo recibe sus oportunidades).
 */

export interface Estado {
  id: string;
  nombre: string;
  orden: number;
  final: boolean;
  activo: boolean;
}

export interface Esquema {
  id: string;
  nombre: string;
  plazos_meses: number[];
  activo: boolean;
}

export interface ContactoFila {
  id: string;
  cliente_id: string;
  tratamiento: string;
  nombre: string;
  puesto: string;
  correo: string;
  telefono: string;
}

export interface ClienteFila {
  id: string;
  razon_social: string;
  rfc: string | null;
  direccion: string;
  ciudad: string;
  creado_en: string;
  contactos: ContactoFila[];
  oportunidades: { id: string }[];
}

export interface OportunidadFila {
  id: string;
  nombre: string;
  estado_id: string;
  esquema_id: string | null;
  ciudad_entrega: string;
  observaciones_internas: string;
  creado_en: string;
  actualizado_en: string;
  ejecutivo_id: string;
  cliente: { id: string; razon_social: string } | null;
  contacto: Omit<ContactoFila, 'cliente_id'> | null;
  ejecutivo: { id: string; nombre: string } | null;
}

export interface SeguimientoFila {
  id: string;
  tipo: 'nota' | 'llamada' | 'visita' | 'correo' | 'cambio_estado';
  texto: string;
  estado_anterior: string | null;
  estado_nuevo: string | null;
  en: string;
  autor: { nombre: string } | null;
}

/** Falla visible: un error de consulta nunca debe parecer «no hay datos» o «no existe». */
function exigir<T>(r: { data: T; error: { code?: string; message: string } | null }, que: string): T {
  if (r.error) {
    console.error(`[datos] ${que}: ${r.error.code ?? ''} ${r.error.message}`);
    throw new Error(`No se pudo consultar ${que} (${r.error.code ?? 'error'}).`);
  }
  return r.data;
}

export async function listarEstados(soloActivos = true): Promise<Estado[]> {
  const supabase = await clienteServidor();
  let q = supabase.from('estados_oportunidad').select(CONSULTAS.estados).order('orden');
  if (soloActivos) q = q.eq('activo', true);
  return (exigir(await q, 'estados') ?? []) as Estado[];
}

export async function listarEsquemas(soloActivos = true): Promise<Esquema[]> {
  const supabase = await clienteServidor();
  let q = supabase.from('esquemas_adquisicion').select(CONSULTAS.esquemas).order('nombre');
  if (soloActivos) q = q.eq('activo', true);
  return (exigir(await q, 'esquemas') ?? []) as Esquema[];
}

export async function listarClientes(): Promise<ClienteFila[]> {
  const supabase = await clienteServidor();
  const r = await supabase.from('clientes').select(CONSULTAS.clientes).order('razon_social');
  return (exigir(r, 'clientes') ?? []) as unknown as ClienteFila[];
}

export async function obtenerCliente(id: string): Promise<ClienteFila | null> {
  const supabase = await clienteServidor();
  const r = await supabase.from('clientes').select(CONSULTAS.clientes).eq('id', id).maybeSingle();
  return (exigir(r, 'el cliente') as unknown as ClienteFila | null) ?? null;
}

export async function listarOportunidades(filtro?: { clienteId?: string }): Promise<OportunidadFila[]> {
  const supabase = await clienteServidor();
  let q = supabase
    .from('oportunidades')
    .select(CONSULTAS.oportunidades)
    .order('actualizado_en', { ascending: false });
  if (filtro?.clienteId) q = q.eq('cliente_id', filtro.clienteId);
  return (exigir(await q, 'oportunidades') ?? []) as unknown as OportunidadFila[];
}

export async function obtenerOportunidad(id: string): Promise<OportunidadFila | null> {
  const supabase = await clienteServidor();
  const r = await supabase.from('oportunidades').select(CONSULTAS.oportunidades).eq('id', id).maybeSingle();
  return (exigir(r, 'la oportunidad') as unknown as OportunidadFila | null) ?? null;
}

export async function listarSeguimiento(
  oportunidadId?: string,
  limite = 50,
): Promise<(SeguimientoFila & { oportunidad_id: string })[]> {
  const supabase = await clienteServidor();
  let q = supabase
    .from('seguimiento')
    .select(CONSULTAS.seguimiento)
    .order('en', { ascending: false })
    .limit(limite);
  if (oportunidadId) q = q.eq('oportunidad_id', oportunidadId);
  return (exigir(await q, 'el seguimiento') ?? []) as unknown as (SeguimientoFila & {
    oportunidad_id: string;
  })[];
}

/** FormData → objeto, con cadenas vacías como «no capturado» para que apliquen los valores por omisión. */
export function leerFormulario(datos: FormData): Record<string, string | undefined> {
  const salida: Record<string, string | undefined> = {};
  for (const [k, v] of datos.entries()) {
    if (typeof v === 'string') salida[k] = v.trim() === '' ? undefined : v;
  }
  return salida;
}
