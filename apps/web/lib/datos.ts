import { CONSULTAS } from './consultas';
import { clienteServidor } from './supabase/servidor';
import { ESTADOS_ABIERTOS, type EstadoTarea, type EtapaTarea } from './etapas-tareas';

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
  autor_id: string | null;
  tipo: 'nota' | 'llamada' | 'visita' | 'correo' | 'cambio_estado';
  texto: string;
  /** Texto con formato (JSON validado); null en registros anteriores o de sistema. */
  contenido: unknown;
  estado_anterior: string | null;
  estado_nuevo: string | null;
  en: string;
  /** Última edición de su autor (la versión anterior queda en la auditoría). */
  editado_en: string | null;
  autor: { nombre: string } | null;
}

export interface TareaFila {
  id: string;
  /** Nulo: tarea libre, no ligada a una oportunidad. */
  oportunidad_id: string | null;
  titulo: string;
  descripcion: string;
  /** Nulo: sin fecha. Con `sin_hora`, vence al final de ese día. */
  vence_en: string | null;
  sin_hora: boolean;
  /** Etapa del pipeline personal (sólo tareas principales). */
  etapa_id: string | null;
  /** Documento de texto con formato (validado al guardar y al mostrar). */
  notas: unknown;
  avisos: { id: string; minutos_antes: number; aviso_en: string }[];
  estado: EstadoTarea;
  completada_en: string | null;
  oportunidad: { id: string; nombre: string; cliente: { razon_social: string } | null } | null;
  /** Subtareas (un nivel), en orden de creación. */
  subtareas: SubtareaFila[];
}

/** Subtarea: como una tarea, con fecha opcional y sin subtareas propias. */
export interface SubtareaFila {
  id: string;
  titulo: string;
  descripcion: string;
  notas: unknown;
  vence_en: string | null;
  sin_hora: boolean;
  estado: EstadoTarea;
  /** Posición entre sus hermanas (se reordenan arrastrando). */
  orden: number;
  completada_en: string | null;
  creado_en: string;
  avisos: { id: string; minutos_antes: number; aviso_en: string }[];
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

/** Borradores propios de una oportunidad (la base sólo devuelve los de quien consulta). */
export interface BorradorTarea {
  titulo: string;
  fecha: string;
  hora: string;
  avisos: number[];
  /** Títulos de subtareas capturadas (borradores anteriores no las traen). */
  subtareas?: string[];
  con_fecha?: boolean;
  /** Oportunidad elegida al crear desde «Mis tareas» ('' = ninguna). */
  oportunidad?: string;
  notas: unknown;
  actualizado_en: string;
}
export interface BorradorNota {
  tipo: 'nota' | 'llamada' | 'visita' | 'correo';
  contenido: unknown;
  actualizado_en: string;
}
export interface Borradores {
  tarea?: BorradorTarea;
  nota?: BorradorNota;
}

/** Borradores propios de una oportunidad, o los de «Mis tareas» (`null`: sin oportunidad). */
export async function listarBorradores(oportunidadId: string | null): Promise<Borradores> {
  const supabase = await clienteServidor();
  const q = supabase.from('borradores').select(CONSULTAS.borradores);
  const filas = exigir(
    await (oportunidadId ? q.eq('oportunidad_id', oportunidadId) : q.is('oportunidad_id', null)),
    'tus borradores',
  ) as { tipo: 'tarea' | 'nota'; datos: Record<string, unknown>; actualizado_en: string }[] | null;
  const salida: Borradores = {};
  for (const f of filas ?? []) {
    if (f.tipo === 'tarea')
      salida.tarea = {
        ...(f.datos as Omit<BorradorTarea, 'actualizado_en'>),
        actualizado_en: f.actualizado_en,
      };
    else
      salida.nota = {
        ...(f.datos as Omit<BorradorNota, 'actualizado_en'>),
        actualizado_en: f.actualizado_en,
      };
  }
  return salida;
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

/** Tareas de quien tiene la sesión (son personales: la base sólo devuelve las suyas). */
export async function listarMisTareas(filtro?: {
  oportunidadId?: string;
  soloPendientes?: boolean;
}): Promise<TareaFila[]> {
  const supabase = await clienteServidor();
  // Sólo tareas principales; sus subtareas vienen embebidas, en orden de creación.
  let q = supabase
    .from('tareas')
    .select(CONSULTAS.tareas)
    .is('tarea_padre_id', null)
    .order('vence_en', { nullsFirst: false })
    .order('creado_en')
    .order('orden', { referencedTable: 'subtareas' })
    .order('creado_en', { referencedTable: 'subtareas' });
  if (filtro?.oportunidadId) q = q.eq('oportunidad_id', filtro.oportunidadId);
  if (filtro?.soloPendientes) q = q.in('estado', ESTADOS_ABIERTOS);
  return (exigir(await q, 'tus tareas') ?? []) as unknown as TareaFila[];
}

/** Etapas del pipeline personal; la base crea las de omisión la primera vez. */
export async function listarMisEtapas(): Promise<EtapaTarea[]> {
  const supabase = await clienteServidor();
  return (exigir(await supabase.rpc('mis_etapas_tarea').select(CONSULTAS.etapas), 'tus etapas') ??
    []) as unknown as EtapaTarea[];
}

/** Oportunidades para ligar una tarea desde «Mis tareas» (sólo las que ve quien consulta). */
export async function listarOportunidadesParaTareas(): Promise<
  { id: string; nombre: string; cliente: string }[]
> {
  const ops = await listarOportunidades();
  return ops.map((o) => ({ id: o.id, nombre: o.nombre, cliente: o.cliente?.razon_social ?? '' }));
}

/** FormData → objeto, con cadenas vacías como «no capturado» para que apliquen los valores por omisión. */
export function leerFormulario(datos: FormData): Record<string, string | undefined> {
  const salida: Record<string, string | undefined> = {};
  for (const [k, v] of datos.entries()) {
    if (typeof v === 'string') salida[k] = v.trim() === '' ? undefined : v;
  }
  return salida;
}

// ───────────── Cotizaciones (Fase 3) ─────────────

export type EstadoRevision = 'borrador' | 'pendiente_autorizacion' | 'autorizada' | 'rechazada' | 'emitida';

export interface CotizacionFila {
  id: string;
  oportunidad_id: string;
  folio: string | null;
  creado_en: string;
  oportunidad: {
    id: string;
    nombre: string;
    ejecutivo_id: string;
    cliente: { razon_social: string } | null;
  } | null;
  revisiones: {
    id: string;
    numero: number;
    estado: EstadoRevision;
    motivo: 'inicial' | 'solicitud_cliente' | 'mejora_precio';
    creado_en: string;
    enviada_en: string | null;
    autorizada_en: string | null;
  }[];
}

export interface CostoFila {
  mayorista_id: string | null;
  moneda: string;
  costo_unitario: string;
  costo_anterior: string | null;
  tipo_cambio: string;
  vigencia: string | null;
}

export interface PartidaFila {
  id: string;
  orden: number;
  sku: string;
  marca_id: string | null;
  descripcion: string;
  descripcion_contenido: unknown;
  entrega: string;
  unidad_id: string | null;
  cantidad: number;
  se_suma: boolean;
  oculta_al_cliente: boolean;
  /** Adicional de otra partida (un nivel). */
  partida_padre_id: string | null;
  /** linea: visible · incluida: dentro del precio de su partida · prorrateada: cargo repartido. */
  presentacion: 'linea' | 'incluida' | 'prorrateada';
  /** Partidas entre las que se reparte (sólo cargos prorrateados). */
  prorrateos: { destino_id: string }[];
  costo: CostoFila | null;
}

export interface PropuestaFila {
  id: string;
  orden: number;
  nombre: string;
  tipo: string;
  es_adicional: boolean;
  partidas: PartidaFila[];
}

export interface RevisionDetalle {
  id: string;
  cotizacion_id: string;
  numero: number;
  estado: EstadoRevision;
  motivo: 'inicial' | 'solicitud_cliente' | 'mejora_precio';
  vigencia_hasta: string | null;
  condiciones: unknown;
  comentario_autorizacion: string;
  enviada_en: string | null;
  autorizada_en: string | null;
  revision_anterior_id: string | null;
  propuestas: PropuestaFila[];
}

export interface CatalogosCotizacion {
  mayoristas: { id: string; nombre: string }[];
  marcas: { id: string; nombre: string }[];
  unidades: { id: string; nombre: string; abreviatura: string | null }[];
  monedas: { codigo: string; nombre: string }[];
}

export async function listarCotizaciones(filtro?: { oportunidadId?: string }): Promise<CotizacionFila[]> {
  const supabase = await clienteServidor();
  let q = supabase
    .from('cotizaciones')
    .select(CONSULTAS.cotizaciones)
    .order('creado_en', { ascending: false })
    .order('numero', { referencedTable: 'revisiones', ascending: false });
  if (filtro?.oportunidadId) q = q.eq('oportunidad_id', filtro.oportunidadId);
  return (exigir(await q, 'las cotizaciones') ?? []) as unknown as CotizacionFila[];
}

/** Una cotización con la revisión pedida (o la más reciente) completa: propuestas, partidas y costos. */
export async function obtenerCotizacion(
  id: string,
  numero?: number,
): Promise<{ cotizacion: CotizacionFila; revision: RevisionDetalle } | null> {
  const supabase = await clienteServidor();
  const c = exigir(
    await supabase
      .from('cotizaciones')
      .select(CONSULTAS.cotizaciones)
      .eq('id', id)
      .order('numero', { referencedTable: 'revisiones', ascending: false })
      .maybeSingle(),
    'la cotización',
  ) as unknown as CotizacionFila | null;
  if (!c) return null;
  const elegida = c.revisiones.find((r) => r.numero === numero) ?? c.revisiones[0];
  if (!elegida) return null;
  const r = exigir(
    await supabase
      .from('revisiones')
      .select(CONSULTAS.revision)
      .eq('id', elegida.id)
      .order('orden', { referencedTable: 'propuestas' })
      .order('orden', { referencedTable: 'propuestas.partidas' })
      .maybeSingle(),
    'la revisión',
  ) as unknown as RevisionDetalle | null;
  if (!r) return null;
  // partida_costos es uno a uno con partidas (su llave es la partida): la API lo entrega como objeto; por si acaso
  // llegara como lista, se normaliza.
  for (const p of r.propuestas)
    for (const pa of p.partidas) {
      const costo = pa.costo as CostoFila | CostoFila[] | null;
      pa.costo = Array.isArray(costo) ? (costo[0] ?? null) : costo;
    }
  return { cotizacion: c, revision: r };
}

export async function listarCatalogosCotizacion(): Promise<CatalogosCotizacion> {
  const supabase = await clienteServidor();
  const [mayoristas, marcas, unidades, monedas] = await Promise.all([
    supabase.from('mayoristas').select(CONSULTAS.mayoristas).eq('activo', true).order('nombre'),
    supabase.from('marcas').select(CONSULTAS.marcas).eq('activa', true).order('nombre'),
    supabase.from('unidades').select(CONSULTAS.unidades).eq('activa', true).order('nombre'),
    supabase.from('monedas').select(CONSULTAS.monedas).eq('activa', true).order('codigo'),
  ]);
  return {
    mayoristas: (exigir(mayoristas, 'los mayoristas') ?? []) as unknown as CatalogosCotizacion['mayoristas'],
    marcas: (exigir(marcas, 'las marcas') ?? []) as unknown as CatalogosCotizacion['marcas'],
    unidades: (exigir(unidades, 'las unidades') ?? []) as unknown as CatalogosCotizacion['unidades'],
    monedas: (exigir(monedas, 'las monedas') ?? []) as unknown as CatalogosCotizacion['monedas'],
  };
}
