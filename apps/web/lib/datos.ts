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

const COLUMNAS_OPORTUNIDAD = `id, nombre, estado_id, esquema_id, ciudad_entrega, observaciones_internas, creado_en,
  actualizado_en, ejecutivo_id, cliente:clientes(id, razon_social),
  contacto:contactos(id, tratamiento, nombre, puesto, correo, telefono), ejecutivo:perfiles(id, nombre)`;

export async function listarEstados(soloActivos = true): Promise<Estado[]> {
  const supabase = await clienteServidor();
  let q = supabase.from('estados_oportunidad').select('id, nombre, orden, final, activo').order('orden');
  if (soloActivos) q = q.eq('activo', true);
  return ((await q).data ?? []) as Estado[];
}

export async function listarEsquemas(soloActivos = true): Promise<Esquema[]> {
  const supabase = await clienteServidor();
  let q = supabase.from('esquemas_adquisicion').select('id, nombre, plazos_meses, activo').order('nombre');
  if (soloActivos) q = q.eq('activo', true);
  return ((await q).data ?? []) as Esquema[];
}

export async function listarClientes(): Promise<ClienteFila[]> {
  const supabase = await clienteServidor();
  const { data } = await supabase
    .from('clientes')
    .select(
      'id, razon_social, rfc, direccion, ciudad, creado_en, contactos(id, cliente_id, tratamiento, nombre, puesto, correo, telefono), oportunidades(id)',
    )
    .order('razon_social');
  return (data ?? []) as unknown as ClienteFila[];
}

export async function obtenerCliente(id: string): Promise<ClienteFila | null> {
  const supabase = await clienteServidor();
  const { data } = await supabase
    .from('clientes')
    .select(
      'id, razon_social, rfc, direccion, ciudad, creado_en, contactos(id, cliente_id, tratamiento, nombre, puesto, correo, telefono), oportunidades(id)',
    )
    .eq('id', id)
    .maybeSingle();
  return (data as unknown as ClienteFila | null) ?? null;
}

export async function listarOportunidades(filtro?: { clienteId?: string }): Promise<OportunidadFila[]> {
  const supabase = await clienteServidor();
  let q = supabase
    .from('oportunidades')
    .select(COLUMNAS_OPORTUNIDAD)
    .order('actualizado_en', { ascending: false });
  if (filtro?.clienteId) q = q.eq('cliente_id', filtro.clienteId);
  return ((await q).data ?? []) as unknown as OportunidadFila[];
}

export async function obtenerOportunidad(id: string): Promise<OportunidadFila | null> {
  const supabase = await clienteServidor();
  const { data } = await supabase
    .from('oportunidades')
    .select(COLUMNAS_OPORTUNIDAD)
    .eq('id', id)
    .maybeSingle();
  return (data as unknown as OportunidadFila | null) ?? null;
}

export async function listarSeguimiento(
  oportunidadId?: string,
  limite = 50,
): Promise<(SeguimientoFila & { oportunidad_id: string })[]> {
  const supabase = await clienteServidor();
  let q = supabase
    .from('seguimiento')
    .select('id, oportunidad_id, tipo, texto, estado_anterior, estado_nuevo, en, autor:perfiles(nombre)')
    .order('en', { ascending: false })
    .limit(limite);
  if (oportunidadId) q = q.eq('oportunidad_id', oportunidadId);
  return ((await q).data ?? []) as unknown as (SeguimientoFila & { oportunidad_id: string })[];
}

/** FormData → objeto, con cadenas vacías como «no capturado» para que apliquen los valores por omisión. */
export function leerFormulario(datos: FormData): Record<string, string | undefined> {
  const salida: Record<string, string | undefined> = {};
  for (const [k, v] of datos.entries()) {
    if (typeof v === 'string') salida[k] = v.trim() === '' ? undefined : v;
  }
  return salida;
}
