import { CONSULTAS } from './consultas';
import { clienteServidor } from './supabase/servidor';
import { ESTADOS_ABIERTOS, type EstadoTarea, type EtapaTarea } from './etapas-tareas';
import type { TipoOportunidad } from './tipos-oportunidad';

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
  /** Texto libre anterior a 2026-10-07; ahora se captura `estado`. */
  ciudad: string;
  estado: string | null;
  creado_en: string;
  contactos: ContactoFila[];
  oportunidades: { id: string }[];
}

export interface OportunidadFila {
  id: string;
  nombre: string;
  estado_id: string;
  esquema_id: string | null;
  /** Tipo general: adquisición, arrendamiento o crédito simple (2026-10-05, 2026-10-07). */
  tipo: TipoOportunidad;
  /** Texto libre anterior a 2026-10-07; ahora se captura `estado_entrega`. */
  ciudad_entrega: string;
  estado_entrega: string | null;
  observaciones_internas: string;
  /** Observaciones con formato (0022); null en las capturadas antes como texto plano. */
  observaciones_contenido: unknown;
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
    tipo: TipoOportunidad;
    estado_entrega: string | null;
    ciudad_entrega: string;
    cliente: { razon_social: string } | null;
    ejecutivo: { nombre: string } | null;
  } | null;
  revisiones: {
    id: string;
    numero: number;
    estado: EstadoRevision;
    motivo: 'inicial' | 'solicitud_cliente' | 'mejora_precio';
    creado_en: string;
    enviada_en: string | null;
    autorizada_en: string | null;
    comentario_autorizacion: string;
    autor: { nombre: string } | null;
    autorizador: { nombre: string } | null;
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
  /** Partida de la Rev anterior de la que se copió (0021). */
  partida_origen_id: string | null;
  /** linea: visible · incluida: dentro del precio de su partida · prorrateada: cargo repartido. */
  presentacion: 'linea' | 'incluida' | 'prorrateada';
  /** Partidas entre las que se reparte (sólo cargos prorrateados). */
  prorrateos: { destino_id: string }[];
  costo: CostoFila | null;
  /** Precio de venta autorizado (lo registra quien autoriza). */
  precio: { precio_unitario: string } | null;
}

export interface PropuestaFila {
  id: string;
  orden: number;
  nombre: string;
  tipo: string;
  es_adicional: boolean;
  /** Propuesta de la Rev anterior de la que se copió (0021). */
  propuesta_origen_id: string | null;
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
  /** Esquema de esta revisión (0024): por omisión, el tipo de la oportunidad. */
  esquema: TipoOportunidad;
  /** En arrendamiento: con qué mayorista se trabaja el arrendamiento. */
  mayorista_arrendamiento_id: string | null;
  /** Adquisición: % de anticipo sobre el total con IVA (lo fija quien autoriza). */
  anticipo_pct: number | string | null;
  /** Arrendamiento con otro mayorista: % de transaccionalidad y a qué partidas aplica. */
  transaccion_pct: number | string | null;
  transaccion_alcance: 'todas' | 'diferentes' | null;
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
  const r = await obtenerRevision(elegida.id);
  if (!r) return null;
  return { cotizacion: c, revision: r };
}

/** Una revisión completa: propuestas, partidas, costos y precios (RLS decide qué ve cada quien). */
export async function obtenerRevision(id: string): Promise<RevisionDetalle | null> {
  const supabase = await clienteServidor();
  const r = exigir(
    await supabase
      .from('revisiones')
      .select(CONSULTAS.revision)
      .eq('id', id)
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
      const precio = pa.precio as PartidaFila['precio'] | PartidaFila['precio'][];
      pa.precio = Array.isArray(precio) ? (precio[0] ?? null) : precio;
    }
  return r;
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

// ───────────── Condiciones y financiamiento (2026-10-05) ─────────────

export interface CondicionCatalogo {
  id: string;
  nombre: string;
  contenido: unknown;
  orden: number;
  activa: boolean;
}

export interface CondicionRevision {
  id: string;
  orden: number;
  condicion_id: string | null;
  contenido: unknown;
}

export interface Financiera {
  id: string;
  nombre: string;
  razon_social: string;
  aseguradoras: string[];
  activa: boolean;
}

export async function listarFinancieras(): Promise<Financiera[]> {
  const supabase = await clienteServidor();
  return (exigir(
    await supabase.from('financieras').select(CONSULTAS.financieras).eq('activa', true).order('nombre'),
    'las financieras',
  ) ?? []) as unknown as Financiera[];
}

/** Opción de financiamiento (0017; campos nuevos en 0023). Los numeric llegan como número. */
export interface FinanciamientoFila {
  id: string;
  propuesta_id: string;
  esquema_id: string | null;
  plazo_meses: number;
  mensualidad: string | null;
  valor_residual: string | null;
  factor: string | null;
  tasa_interes: string | null;
  gastos_apertura: string | null;
  orden: number;
  financiera_id: string | null;
  aseguradora: string;
  folio_financiera: string;
  tipo_arrendamiento: 'vjm' | 'fpo' | null;
  frecuencia: 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual';
  valor_equipos: string | null;
  residual_capturado: 'pct' | 'monto' | null;
  residual_pct: string | null;
  pago_seguro: string | null;
  vigencia_financiera: string | null;
  fecha_emision_financiera: string | null;
}

export async function listarCondicionesCatalogo(soloActivas = true): Promise<CondicionCatalogo[]> {
  const supabase = await clienteServidor();
  let q = supabase.from('condiciones_comerciales').select(CONSULTAS.condiciones).order('orden');
  if (soloActivas) q = q.eq('activa', true);
  return (exigir(await q, 'las condiciones') ?? []) as unknown as CondicionCatalogo[];
}

export async function listarCondicionesDeRevision(revisionId: string): Promise<CondicionRevision[]> {
  const supabase = await clienteServidor();
  return (exigir(
    await supabase
      .from('revision_condiciones')
      .select(CONSULTAS.revisionCondiciones)
      .eq('revision_id', revisionId)
      .order('orden'),
    'las condiciones de la cotización',
  ) ?? []) as unknown as CondicionRevision[];
}

export async function listarFinanciamiento(propuestaIds: string[]): Promise<FinanciamientoFila[]> {
  if (!propuestaIds.length) return [];
  const supabase = await clienteServidor();
  return (exigir(
    await supabase
      .from('propuesta_financiamientos')
      .select(CONSULTAS.financiamientos)
      .in('propuesta_id', propuestaIds)
      .order('orden'),
    'el financiamiento',
  ) ?? []) as unknown as FinanciamientoFila[];
}

// ───────────── Autorización (Fase 3C) ─────────────

/** Utilidad guardada de cada partida (sólo la recibe quien tiene «utilidad.ver»; a los demás RLS no les da filas). */
export async function listarUtilidades(partidas: string[]): Promise<Record<string, string>> {
  return (await listarUtilidadesYTransaccion(partidas)).utilidades;
}

/** Utilidad y % de transaccionalidad guardados por partida (sólo quien tiene «utilidad.ver» recibe filas). */
export async function listarUtilidadesYTransaccion(
  partidas: string[],
): Promise<{ utilidades: Record<string, string>; transacciones: Record<string, string> }> {
  if (!partidas.length) return { utilidades: {}, transacciones: {} };
  const supabase = await clienteServidor();
  const filas = (exigir(
    await supabase.from('partida_utilidad').select(CONSULTAS.utilidades).in('partida_id', partidas),
    'la utilidad',
  ) ?? []) as unknown as {
    partida_id: string;
    utilidad_pct: number | string;
    transaccion_pct: number | string;
  }[];
  // La base la entrega como número («13.5»): se pasa a texto sin ceros de más.
  return {
    utilidades: Object.fromEntries(filas.map((f) => [f.partida_id, String(Number(f.utilidad_pct))])),
    transacciones: Object.fromEntries(
      filas
        .filter((f) => Number(f.transaccion_pct) > 0)
        .map((f) => [f.partida_id, String(Number(f.transaccion_pct))]),
    ),
  };
}

/** T.C. que fijó quien autoriza en la revisión, por moneda (0020). */
export async function listarTiposCambio(revisionId: string): Promise<Record<string, string>> {
  const supabase = await clienteServidor();
  const filas = (exigir(
    await supabase.from('revision_tipos_cambio').select(CONSULTAS.tiposCambio).eq('revision_id', revisionId),
    'el tipo de cambio',
  ) ?? []) as unknown as { moneda: string; tipo_cambio: number | string }[];
  return Object.fromEntries(filas.map((f) => [f.moneda, String(Number(f.tipo_cambio))]));
}

export interface RevisionBandeja {
  id: string;
  numero: number;
  estado: EstadoRevision;
  enviada_en: string | null;
  autorizada_en: string | null;
  comentario_autorizacion: string;
  cotizacion: {
    id: string;
    folio: string | null;
    oportunidad: {
      id: string;
      nombre: string;
      cliente: { razon_social: string } | null;
      ejecutivo: { nombre: string } | null;
    } | null;
  } | null;
  propuestas: {
    id: string;
    partidas: {
      id: string;
      cantidad: number;
      partida_padre_id: string | null;
      presentacion: 'linea' | 'incluida' | 'prorrateada';
      costo: { costo_unitario: number | string; tipo_cambio: number | string } | null;
    }[];
  }[];
}

/** Bandeja de quien autoriza: lo que espera autorización (lo más antiguo primero) y lo resuelto recientemente. */
export async function listarBandeja(): Promise<{
  pendientes: RevisionBandeja[];
  recientes: RevisionBandeja[];
}> {
  const supabase = await clienteServidor();
  const [pendientes, recientes] = await Promise.all([
    supabase
      .from('revisiones')
      .select(CONSULTAS.bandeja)
      .eq('estado', 'pendiente_autorizacion')
      .order('enviada_en', { ascending: true }),
    supabase
      .from('revisiones')
      .select(CONSULTAS.bandeja)
      .in('estado', ['autorizada', 'rechazada', 'emitida'])
      .not('enviada_en', 'is', null)
      .order('enviada_en', { ascending: false })
      .limit(12),
  ]);
  const normalizar = (lista: RevisionBandeja[]) => {
    for (const r of lista)
      for (const p of r.propuestas)
        for (const pa of p.partidas) {
          const costo = pa.costo as
            RevisionBandeja['propuestas'][number]['partidas'][number]['costo'] | unknown[];
          pa.costo = Array.isArray(costo) ? ((costo[0] as typeof pa.costo) ?? null) : costo;
        }
    return lista;
  };
  return {
    pendientes: normalizar(
      (exigir(pendientes, 'la bandeja de autorización') ?? []) as unknown as RevisionBandeja[],
    ),
    recientes: normalizar(
      (exigir(recientes, 'las autorizaciones recientes') ?? []) as unknown as RevisionBandeja[],
    ),
  };
}

/** Revisiones que esperan autorización (contador del menú). */
export async function contarPorAutorizar(): Promise<number> {
  const supabase = await clienteServidor();
  const { count } = await supabase
    .from('revisiones')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'pendiente_autorizacion');
  return count ?? 0;
}
