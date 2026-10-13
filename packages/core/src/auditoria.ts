import { sufijoRevision } from './revisiones';

/**
 * Auditoría (Fase 7, 2026-10-13): convierte las filas de `public.auditoria` (una por registro tocado) en acciones
 * legibles («Alejandro autorizó la Rev A») con el detalle campo por campo de lo que había antes y lo que quedó.
 * Una acción es una transacción: sus filas comparten hora (`en`) y usuario.
 */

export type AccionSql = 'INSERT' | 'UPDATE' | 'DELETE';
export type Registro = Record<string, unknown>;

export interface FilaAuditoria {
  id: number;
  en: string;
  usuarioId: string | null;
  usuario: string | null;
  tabla: string;
  registroId: string;
  accion: AccionSql;
  antes: Registro | null;
  despues: Registro | null;
  revisionId: string | null;
  revisionNumero: number | null;
  cotizacionId: string | null;
  folio: string | null;
  oportunidadId: string | null;
  oportunidad: string | null;
  clienteId: string | null;
  cliente: string | null;
  /** «Partida 2 · SKU» en filas de costo, utilidad, precio y prorrateo. */
  etiqueta: string | null;
  sensible: boolean;
}

/** Nombres para mostrar los identificadores (personas, roles y catálogos). */
export interface NombresAuditoria {
  perfiles?: Record<string, string>;
  roles?: Record<string, string>;
  mayoristas?: Record<string, string>;
  estados?: Record<string, string>;
  financieras?: Record<string, string>;
  contactos?: Record<string, string>;
}

export type TipoAccion =
  | 'autorizacion'
  | 'emision'
  | 'cancelacion'
  | 'cotizacion'
  | 'partidas'
  | 'condiciones'
  | 'financiamiento'
  | 'oportunidad'
  | 'seguimiento'
  | 'cliente'
  | 'usuario'
  | 'permisos'
  | 'catalogo'
  | 'otro';

export type TonoAccion = 'exito' | 'info' | 'peligro' | 'aviso' | 'neutro';

export interface CambioCampo {
  /** A qué pertenece el campo («Partida 2 · 2GHTM», «Opción 1»…); vacío si es el registro principal. */
  entidad: string;
  campo: string;
  tipo: 'modificado' | 'agregado' | 'quitado';
  antes: string | null;
  despues: string | null;
  /** Texto largo (descripción, condición): se compara palabra por palabra. */
  largo: boolean;
}

export interface AccionAuditoria {
  clave: string;
  en: string;
  usuarioId: string | null;
  /** «Sistema» cuando no hubo sesión (migraciones, tareas internas). */
  usuario: string;
  tipo: TipoAccion;
  tono: TonoAccion;
  /** Frase: «{usuario} {verbo} {objeto}», p. ej. «autorizó la» + «Rev A». */
  verbo: string;
  objeto: string | null;
  /** Folio y cliente, o el detalle del cambio («Ejecutivo → Cotizador»). */
  contexto: string;
  sensible: boolean;
  cotizacionId: string | null;
  oportunidadId: string | null;
  clienteId: string | null;
  revisionNumero: number | null;
  cambios: CambioCampo[];
  filas: FilaAuditoria[];
}

// ───────────── Módulos (filtro «Qué») ─────────────

export const MODULOS_AUDITORIA = {
  cotizaciones: {
    nombre: 'Cotizaciones',
    tablas: [
      'cotizaciones',
      'revisiones',
      'propuestas',
      'partidas',
      'partida_costos',
      'partida_precios',
      'partida_utilidad',
      'partida_prorrateos',
      'revision_condiciones',
      'revision_tipos_cambio',
      'propuesta_financiamientos',
      'solicitudes_cancelacion',
    ],
  },
  oportunidades: {
    nombre: 'Oportunidades',
    tablas: ['oportunidades', 'oportunidad_colaboradores', 'seguimiento'],
  },
  clientes: { nombre: 'Clientes', tablas: ['clientes', 'contactos'] },
  usuarios: { nombre: 'Usuarios y permisos', tablas: ['perfiles', 'roles', 'rol_permisos'] },
  catalogos: {
    nombre: 'Catálogos',
    tablas: [
      'monedas',
      'unidades',
      'mayoristas',
      'marcas',
      'estados_oportunidad',
      'esquemas_adquisicion',
      'condiciones_comerciales',
      'financieras',
      'paquetes_condiciones',
      'paquete_condiciones',
      'configuracion',
    ],
  },
} as const;
export type ModuloAuditoria = keyof typeof MODULOS_AUDITORIA;

export function moduloDeTabla(tabla: string): ModuloAuditoria | null {
  for (const [clave, m] of Object.entries(MODULOS_AUDITORIA) as [
    ModuloAuditoria,
    { tablas: readonly string[] },
  ][])
    if (m.tablas.includes(tabla)) return clave;
  return null;
}

// ───────────── Formato de valores ─────────────

const ESTADOS_REVISION: Record<string, string> = {
  borrador: 'Borrador',
  pendiente_autorizacion: 'Pendiente de autorización',
  autorizada: 'Autorizada',
  rechazada: 'Rechazada',
  emitida: 'Emitida',
};

const ENUMS: Record<string, Record<string, string>> = {
  estado: ESTADOS_REVISION,
  motivo: {
    inicial: 'Original',
    solicitud_cliente: 'Solicitud del cliente',
    mejora_precio: 'Mejora de precio',
    error_captura: 'Error de captura',
  },
  visibilidad: { nuevo_folio: 'Nuevo folio', visible: 'Rev visible', interna: 'Rev interna' },
  esquema: { adquisicion: 'Adquisición', arrendamiento: 'Arrendamiento', credito_simple: 'Crédito simple' },
  tipo_arrendamiento: { vjm: 'Arrendamiento puro (VJM)', fpo: 'Arrendamiento financiero (FPO)' },
  presentacion: {
    linea: 'Línea propia',
    incluida: 'Incluido en el precio',
    prorrateada: 'Cargo prorrateado',
  },
  transaccion_alcance: { todas: 'Todas las partidas', diferentes: 'Sólo las de otro proveedor' },
  residual_capturado: { pct: 'En %', monto: 'En monto' },
  frecuencia: {
    mensual: 'Mensual',
    bimestral: 'Bimestral',
    trimestral: 'Trimestral',
    semestral: 'Semestral',
    anual: 'Anual',
  },
};

const DINERO = new Set([
  'costo_unitario',
  'costo_anterior',
  'precio_unitario',
  'mensualidad',
  'valor_residual',
  'gastos_apertura',
  'valor_equipos',
  'pago_seguro',
  'gastos_administrativos',
  'seguro_equipo',
]);
const PORCENTAJE = new Set([
  'utilidad_pct',
  'transaccion_pct',
  'anticipo_pct',
  'residual_pct',
  'tasa_interes',
  'tasa_financiera',
]);
const FECHA_HORA = new Set(['vigencia_hasta']);
const FECHA = new Set(['vigencia', 'vigencia_financiera', 'fecha_emision_financiera']);
const LARGOS = new Set([
  'descripcion',
  'contenido',
  'texto',
  'razon',
  'observaciones_internas',
  'motivo_cancelacion',
]);

/** Etiquetas de los campos que se muestran; un campo que no está aquí no se muestra (ids internos, fechas de sistema). */
const CAMPOS: Record<string, string> = {
  // Revisión
  estado: 'Estado',
  vigencia_hasta: 'Vigencia',
  esquema: 'Esquema',
  mayorista_arrendamiento_id: 'Mayorista del arrendamiento',
  anticipo_pct: 'Anticipo',
  transaccion_pct: 'Transaccionalidad',
  transaccion_alcance: 'Transaccionalidad en',
  razon: 'Razón',
  visibilidad: 'Presentación',
  motivo: 'Motivo',
  motivo_retiro: 'Motivo del retiro',
  comentario_autorizacion: 'Comentario de quien autoriza',
  folio: 'Folio',
  motivo_cancelacion: 'Motivo de cancelación',
  // Propuestas y partidas
  nombre: 'Nombre',
  tipo: 'Tipo',
  modalidad: 'Modalidad',
  es_adicional: 'Adicionales',
  sku: 'SKU',
  descripcion: 'Descripción',
  marca: 'Marca',
  entrega: 'Tiempo de entrega',
  unidad_id: 'Unidad',
  cantidad: 'Cantidad',
  se_suma: 'Se suma',
  presentacion: 'Presentación',
  oculta_al_cliente: 'Oculta al cliente',
  costo_unitario: 'Costo unitario',
  costo_anterior: 'Precio anterior',
  moneda: 'Moneda',
  tipo_cambio: 'Tipo de cambio',
  vigencia: 'Vigencia del precio',
  mayorista_id: 'Mayorista',
  utilidad_pct: 'Utilidad',
  precio_unitario: 'Precio unitario',
  // Condiciones
  contenido: 'Texto',
  // Financiamiento
  financiera_id: 'Financiera',
  aseguradora: 'Aseguradora',
  folio_financiera: 'Cotización de la financiera',
  tipo_arrendamiento: 'Tipo de arrendamiento',
  plazo_meses: 'Plazo (meses)',
  frecuencia: 'Frecuencia',
  valor_equipos: 'Valor de los equipos',
  mensualidad: 'Pago de los equipos',
  pago_seguro: 'Pago del seguro',
  valor_residual: 'Valor residual',
  residual_pct: 'Valor residual (%)',
  residual_capturado: 'Residual capturado',
  factor: 'Factor',
  tasa_interes: 'Tasa calculada',
  tasa_financiera: 'Tasa de la financiera',
  gastos_apertura: 'Gastos iniciales',
  gastos_administrativos: 'Gastos administrativos',
  seguro_equipo: 'Seguro de equipo',
  vigencia_financiera: 'Vigencia de la financiera',
  fecha_emision_financiera: 'Emisión de la financiera',
  // Oportunidad
  estado_id: 'Estado',
  ejecutivo_id: 'Ejecutivo',
  contacto_id: 'Contacto',
  estado_entrega: 'Estado de entrega',
  ciudad_entrega: 'Ciudad de entrega',
  observaciones_internas: 'Observaciones',
  // Clientes y contactos
  razon_social: 'Razón social',
  rfc: 'RFC',
  direccion: 'Dirección',
  ciudad: 'Ciudad',
  tratamiento: 'Tratamiento',
  puesto: 'Puesto',
  correo: 'Correo',
  telefono: 'Teléfono',
  // Usuarios
  rol_id: 'Rol',
  activo: 'Activo',
  activa: 'Activa',
  permiso_id: 'Permiso',
  // Seguimiento y solicitudes
  texto: 'Nota',
  comentario: 'Comentario',
  // Catálogos
  abreviatura: 'Abreviatura',
  trabaja_arrendamiento: 'Trabaja arrendamiento',
  aseguradoras: 'Aseguradoras',
  valor: 'Valor',
};

/** Etiquetas que dependen de la tabla. */
const CAMPOS_POR_TABLA: Record<string, Record<string, string>> = {
  oportunidades: { tipo: 'Tipo', estado_id: 'Estado' },
  clientes: { estado: 'Estado de la República' },
  seguimiento: { tipo: 'Tipo' },
  solicitudes_cancelacion: { estado: 'Estado', motivo: 'Motivo' },
};

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «20 oct 2026, 16:30 h» en la hora de la Ciudad de México. */
export function fechaHoraAuditoria(iso: string, conHora = true): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  const fecha = `${Number(p.day)} ${MESES[Number(p.month) - 1]} ${p.year}`;
  return conHora ? `${fecha}, ${p.hour}:${p.minute} h` : fecha;
}

/** Separa miles de un número decimal en texto, sin pasar por punto flotante: «1234567.5» → «1,234,567.50». */
export function conMiles(valor: string, decimales = 2): string {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(valor.trim());
  if (!m) return valor;
  const [, signo = '', entero = '', frac = ''] = m;
  const miles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const f =
    frac.length >= decimales ? frac.replace(/0+$/, '').padEnd(decimales, '0') : frac.padEnd(decimales, '0');
  return `${signo}${miles}${f ? `.${f}` : ''}`;
}

const sinCerosFinales = (v: string) => (v.includes('.') ? v.replace(/0+$/, '').replace(/\.$/, '') : v);

/** Texto plano de un documento con formato (Tiptap JSON); cada párrafo en su renglón. */
export function textoDeContenido(contenido: unknown): string {
  const partes: string[] = [];
  const recorrer = (n: unknown) => {
    if (!n || typeof n !== 'object') return;
    const nodo = n as { type?: string; text?: string; content?: unknown[] };
    if (typeof nodo.text === 'string') partes.push(nodo.text);
    if (Array.isArray(nodo.content)) nodo.content.forEach(recorrer);
    if (nodo.type === 'paragraph' || nodo.type === 'listItem' || nodo.type === 'heading') partes.push('\n');
  };
  recorrer(contenido);
  return partes
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** Valor legible de un campo; null si no hay valor. */
export function valorAuditoria(campo: string, valor: unknown, nombres: NombresAuditoria = {}): string | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  if (campo === 'contenido') return textoDeContenido(valor) || null;
  if (Array.isArray(valor)) return valor.map(String).join(', ');
  if (typeof valor === 'object') return null;
  const v = String(valor);
  if (DINERO.has(campo)) return `$${conMiles(v)}`;
  if (PORCENTAJE.has(campo)) return `${conMiles(sinCerosFinales(v), 0)} %`;
  if (FECHA_HORA.has(campo)) return fechaHoraAuditoria(v);
  if (FECHA.has(campo)) return fechaHoraAuditoria(`${v.slice(0, 10)}T12:00:00-06:00`, false);
  if (campo === 'ejecutivo_id') return nombres.perfiles?.[v] ?? 'Otra persona';
  if (campo === 'rol_id') return nombres.roles?.[v] ?? v;
  if (campo === 'mayorista_id' || campo === 'mayorista_arrendamiento_id')
    return nombres.mayoristas?.[v] ?? 'Otro mayorista';
  if (campo === 'estado_id') return nombres.estados?.[v] ?? v;
  if (campo === 'financiera_id') return nombres.financieras?.[v] ?? 'Otra financiera';
  if (campo === 'contacto_id') return nombres.contactos?.[v] ?? 'Otro contacto';
  if (campo === 'tipo_cambio' || campo === 'factor') return sinCerosFinales(v);
  return ENUMS[campo]?.[v] ?? v;
}

function etiquetaCampo(tabla: string, campo: string): string | null {
  return CAMPOS_POR_TABLA[tabla]?.[campo] ?? CAMPOS[campo] ?? null;
}

/** «la Rev A» / «la versión original». */
export function nombreRevision(numero: number | null): string {
  if (numero === null) return 'revisión';
  const s = sufijoRevision(numero);
  return s ? `Rev ${s}` : 'versión original';
}

/** A qué pertenece una fila dentro de la acción («Partida 2 · 2GHTM», «Opción 1», el nombre de la propuesta…). */
function entidadDe(f: FilaAuditoria): string {
  const r = f.despues ?? f.antes ?? {};
  const txt = (k: string) => (typeof r[k] === 'string' ? (r[k] as string) : '');
  switch (f.tabla) {
    case 'partidas':
      return [`Partida ${String(r.orden ?? '')}`.trim(), txt('sku')].filter(Boolean).join(' · ');
    case 'partida_costos':
    case 'partida_precios':
    case 'partida_utilidad':
    case 'partida_prorrateos':
      return f.etiqueta ?? 'Partida';
    case 'propuestas':
      return txt('nombre') || 'Propuesta';
    case 'propuesta_financiamientos':
      return `Opción ${String(r.orden ?? '')}`.trim();
    case 'revision_condiciones':
    case 'paquete_condiciones':
      return `Condición ${String(r.orden ?? '')}`.trim();
    case 'revision_tipos_cambio':
      return `T.C. ${txt('moneda')}`;
    case 'contactos':
      return txt('nombre') || 'Contacto';
    case 'rol_permisos':
      return txt('rol_id');
    default:
      return '';
  }
}

/** Resumen de una fila agregada o quitada (una línea). */
function resumenDe(f: FilaAuditoria, nombres: NombresAuditoria): string | null {
  const r = f.despues ?? f.antes ?? {};
  if (f.tabla === 'partidas')
    return (
      String(r.descripcion ?? '')
        .split('\n')[0]
        ?.slice(0, 140) || null
    );
  if (
    f.tabla === 'revision_condiciones' ||
    f.tabla === 'paquete_condiciones' ||
    f.tabla === 'condiciones_comerciales'
  )
    return (
      textoDeContenido(r.contenido).split('\n')[0]?.slice(0, 160) || (r.nombre ? String(r.nombre) : null)
    );
  if (f.tabla === 'propuesta_financiamientos')
    return [
      nombres.financieras?.[String(r.financiera_id)],
      r.plazo_meses ? `${String(r.plazo_meses)} meses` : null,
    ]
      .filter(Boolean)
      .join(' · ');
  if (f.tabla === 'rol_permisos') return String(r.permiso_id ?? '');
  if (f.tabla === 'partida_prorrateos') return 'Reparto del cargo';
  for (const k of ['nombre', 'razon_social', 'texto', 'sku', 'codigo', 'clave'])
    if (typeof r[k] === 'string' && r[k]) return (r[k] as string).slice(0, 140);
  return null;
}

const OMITIR_ALTA = new Set([
  'revisiones',
  'cotizaciones',
  'oportunidades',
  'perfiles',
  'clientes',
  'solicitudes_cancelacion',
]);

/** Cambios campo por campo de las filas de una acción. */
export function cambiosDeFilas(filas: FilaAuditoria[], nombres: NombresAuditoria = {}): CambioCampo[] {
  const lista: CambioCampo[] = [];
  for (const f of filas) {
    const entidad = entidadDe(f);
    if (f.accion === 'UPDATE' && f.antes && f.despues) {
      for (const campo of Object.keys({ ...f.antes, ...f.despues })) {
        const etiqueta = etiquetaCampo(f.tabla, campo);
        if (!etiqueta) continue;
        const antes = valorAuditoria(campo, f.antes[campo], nombres);
        const despues = valorAuditoria(campo, f.despues[campo], nombres);
        if (antes === despues) continue;
        lista.push({
          entidad,
          campo: etiqueta,
          tipo: 'modificado',
          antes,
          despues,
          largo: LARGOS.has(campo),
        });
      }
    } else if (f.accion === 'INSERT' && !OMITIR_ALTA.has(f.tabla)) {
      // Una alta de costo, utilidad o precio se muestra como su valor nuevo.
      const valor = soloValor(f, nombres);
      if (valor)
        lista.push({
          entidad,
          campo: valor.campo,
          tipo: 'agregado',
          antes: null,
          despues: valor.texto,
          largo: false,
        });
      else
        lista.push({
          entidad: entidad || etiquetaTabla(f.tabla),
          campo: 'Se agregó',
          tipo: 'agregado',
          antes: null,
          despues: resumenDe(f, nombres),
          largo: true,
        });
    } else if (f.accion === 'DELETE') {
      lista.push({
        entidad: entidad || etiquetaTabla(f.tabla),
        campo: 'Se quitó',
        tipo: 'quitado',
        antes: resumenDe(f, nombres),
        despues: null,
        largo: true,
      });
    }
  }
  // Un mismo dato guardado en dos tablas (p. ej. el folio en la revisión y en la cotización) se muestra una vez.
  // Lo del registro principal (estado, vigencia…) va primero; luego partidas, opciones y condiciones.
  const vistos = new Set<string>();
  return lista
    .filter((c) => {
      const clave = [c.entidad, c.campo, c.antes, c.despues].join('|');
      if (vistos.has(clave)) return false;
      vistos.add(clave);
      return true;
    })
    .sort((x, y) => Number(Boolean(x.entidad)) - Number(Boolean(y.entidad)));
}

/** Filas de un solo dato (costo, utilidad, precio, T.C.): su valor. */
function soloValor(f: FilaAuditoria, nombres: NombresAuditoria): { campo: string; texto: string } | null {
  const r = f.despues ?? {};
  const k =
    f.tabla === 'partida_costos'
      ? 'costo_unitario'
      : f.tabla === 'partida_utilidad'
        ? 'utilidad_pct'
        : f.tabla === 'partida_precios'
          ? 'precio_unitario'
          : f.tabla === 'revision_tipos_cambio'
            ? 'tipo_cambio'
            : null;
  if (!k || !(k in r)) return null;
  const texto = valorAuditoria(k, r[k], nombres);
  const extra = f.tabla === 'partida_costos' && r.moneda && r.moneda !== 'MXN' ? ` ${String(r.moneda)}` : '';
  return texto ? { campo: CAMPOS[k] ?? k, texto: texto + extra } : null;
}

const TABLAS: Record<string, string> = {
  monedas: 'moneda',
  unidades: 'unidad',
  mayoristas: 'mayorista',
  marcas: 'marca',
  estados_oportunidad: 'estado de oportunidad',
  esquemas_adquisicion: 'esquema',
  condiciones_comerciales: 'condición del catálogo',
  financieras: 'financiera',
  paquetes_condiciones: 'paquete de condiciones',
  paquete_condiciones: 'condición del paquete',
  configuracion: 'configuración',
  partidas: 'partida',
  propuestas: 'propuesta',
  contactos: 'contacto',
  roles: 'rol',
  rol_permisos: 'permiso',
};

const CATALOGOS_CON_ARTICULO: Record<string, string> = {
  monedas: 'la moneda',
  unidades: 'la unidad',
  mayoristas: 'el mayorista',
  marcas: 'la marca',
  estados_oportunidad: 'el estado de oportunidad',
  esquemas_adquisicion: 'el esquema',
  condiciones_comerciales: 'la condición',
  financieras: 'la financiera',
};

function etiquetaTabla(tabla: string): string {
  const t = TABLAS[tabla] ?? tabla.replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ───────────── Narración ─────────────

/** Agrupa filas (ya ordenadas de la más reciente a la más antigua) en acciones: misma hora y mismo usuario. */
export function agruparAuditoria(filas: FilaAuditoria[], nombres: NombresAuditoria = {}): AccionAuditoria[] {
  const grupos = new Map<string, FilaAuditoria[]>();
  for (const f of filas) {
    const clave = `${f.en}|${f.usuarioId ?? ''}`;
    const g = grupos.get(clave);
    if (g) g.push(f);
    else grupos.set(clave, [f]);
  }
  return [...grupos.entries()].map(([clave, g]) => narrarAccion(clave, g, nombres));
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function narrarAccion(
  clave: string,
  filas: FilaAuditoria[],
  nombres: NombresAuditoria = {},
): AccionAuditoria {
  const f0 = filas[0];
  if (!f0) throw new Error('Acción sin registros');
  const conContexto = filas.find((f) => f.cotizacionId) ?? filas.find((f) => f.oportunidadId) ?? f0;
  const revisionNumero = filas.find((f) => f.revisionNumero !== null)?.revisionNumero ?? null;
  const rev = nombreRevision(revisionNumero);
  const folioCliente = [
    conContexto.folio ?? (conContexto.cotizacionId ? 'Sin folio' : null),
    conContexto.cliente,
  ]
    .filter(Boolean)
    .join(' · ');
  const base: AccionAuditoria = {
    clave,
    en: f0.en,
    usuarioId: f0.usuarioId,
    usuario: f0.usuario ?? (f0.usuarioId ? 'Usuario dado de baja' : 'Sistema'),
    tipo: 'otro',
    tono: 'neutro',
    verbo: 'modificó',
    objeto: null,
    contexto: folioCliente || conContexto.oportunidad || '',
    sensible: filas.some((f) => f.sensible),
    cotizacionId: conContexto.cotizacionId,
    oportunidadId: conContexto.oportunidadId,
    clienteId: conContexto.clienteId,
    revisionNumero,
    cambios: cambiosDeFilas(filas, nombres),
    filas,
  };
  const es = (tabla: string, accion?: AccionSql) =>
    filas.find((f) => f.tabla === tabla && (!accion || f.accion === accion));
  const cambio = (f: FilaAuditoria | undefined, campo: string) =>
    f?.accion === 'UPDATE' && f.antes?.[campo] !== f.despues?.[campo] ? f : undefined;
  const a = (o: Partial<AccionAuditoria>): AccionAuditoria => ({ ...base, ...o });

  // Revisión: cambios de estado, emisión, cancelación, alta y baja.
  const revUpd = es('revisiones', 'UPDATE');
  const solicitud = es('solicitudes_cancelacion');
  if (revUpd && !revUpd.antes?.cancelada_en && revUpd.despues?.cancelada_en)
    return a({
      tipo: 'cancelacion',
      tono: 'peligro',
      verbo: 'canceló el folio',
      objeto: String(revUpd.despues.folio ?? rev),
    });
  if (solicitud?.accion === 'INSERT')
    return a({
      tipo: 'cancelacion',
      tono: 'peligro',
      verbo: 'solicitó cancelar el folio',
      objeto: conContexto.folio ?? rev,
      contexto: [folioCliente, `«${String(solicitud.despues?.motivo ?? '')}»`].filter(Boolean).join(' · '),
    });
  if (solicitud?.accion === 'UPDATE' && solicitud.despues?.estado === 'rechazada')
    return a({
      tipo: 'cancelacion',
      tono: 'aviso',
      verbo: 'rechazó la cancelación del folio',
      objeto: conContexto.folio ?? rev,
    });
  const estado = cambio(revUpd, 'estado');
  if (estado) {
    const de = String(estado.antes?.estado);
    const aEstado = String(estado.despues?.estado);
    if (aEstado === 'emitida')
      return a({
        tipo: 'emision',
        tono: 'info',
        verbo: 'emitió la cotización',
        objeto: String(estado.despues?.folio ?? rev),
      });
    if (aEstado === 'autorizada')
      return a({ tipo: 'autorizacion', tono: 'exito', verbo: 'autorizó la', objeto: rev });
    if (aEstado === 'rechazada')
      return a({ tipo: 'autorizacion', tono: 'peligro', verbo: 'rechazó la', objeto: rev });
    if (aEstado === 'pendiente_autorizacion')
      return a({ tipo: 'autorizacion', tono: 'info', verbo: 'envió a autorización la', objeto: rev });
    if (aEstado === 'borrador' && de === 'pendiente_autorizacion')
      return a({
        tipo: 'autorizacion',
        tono: 'aviso',
        verbo: estado.despues?.motivo_retiro ? 'retiró para corregir la' : 'regresó a borrador la',
        objeto: rev,
      });
  }
  const revIns = es('revisiones', 'INSERT');
  if (revIns) {
    const numero = Number(revIns.despues?.numero ?? 0);
    if (numero === 0)
      return a({ tipo: 'cotizacion', tono: 'info', verbo: 'creó una cotización', objeto: null });
    const motivo = valorAuditoria('motivo', revIns.despues?.motivo);
    return a({
      tipo: 'cotizacion',
      tono: 'info',
      verbo: 'creó la',
      objeto: nombreRevision(numero),
      contexto: [folioCliente, motivo, revIns.despues?.razon ? `«${String(revIns.despues.razon)}»` : null]
        .filter(Boolean)
        .join(' · '),
    });
  }
  if (es('cotizaciones', 'DELETE'))
    return a({ tipo: 'cotizacion', tono: 'peligro', verbo: 'eliminó una cotización', objeto: null });
  if (es('revisiones', 'DELETE'))
    return a({ tipo: 'cotizacion', tono: 'peligro', verbo: 'descartó la', objeto: rev });

  // Contenido de la cotización.
  const tablasPartida = ['partidas', 'partida_costos', 'partida_prorrateos', 'propuestas'];
  if (filas.some((f) => tablasPartida.includes(f.tabla))) {
    const p = filas.filter((f) => f.tabla === 'partidas');
    const altas = p.filter((f) => f.accion === 'INSERT').length;
    const bajas = p.filter((f) => f.accion === 'DELETE').length;
    const ids = new Set(
      filas
        .filter((f) => ['partidas', 'partida_costos'].includes(f.tabla) && f.accion === 'UPDATE')
        .map((f) => f.registroId),
    );
    const partes = [
      altas && `agregó ${plural(altas, 'partida', 'partidas')}`,
      ids.size && `modificó ${plural(ids.size, 'partida', 'partidas')}`,
      bajas && `quitó ${plural(bajas, 'partida', 'partidas')}`,
    ].filter(Boolean) as string[];
    const verbo = partes.length
      ? `${partes.length > 1 ? `${partes.slice(0, -1).join(', ')} y ${partes.at(-1) ?? ''}` : partes[0]} de la`
      : 'modificó las partidas de la';
    return a({ tipo: 'partidas', tono: 'info', verbo, objeto: rev });
  }
  if (es('partida_utilidad') || es('partida_precios'))
    return a({
      tipo: 'autorizacion',
      tono: 'neutro',
      verbo: 'guardó avance de la corrida de la',
      objeto: rev,
    });
  if (es('revision_condiciones'))
    return a({
      tipo: 'condiciones',
      tono: 'neutro',
      verbo: 'actualizó las condiciones comerciales de la',
      objeto: rev,
    });
  if (es('propuesta_financiamientos'))
    return a({
      tipo: 'financiamiento',
      tono: 'neutro',
      verbo: 'actualizó el financiamiento de la',
      objeto: rev,
    });
  if (es('revision_tipos_cambio'))
    return a({ tipo: 'autorizacion', tono: 'neutro', verbo: 'fijó el tipo de cambio de la', objeto: rev });
  if (revUpd)
    return a({ tipo: 'cotizacion', tono: 'neutro', verbo: 'actualizó los datos de la', objeto: rev });

  // Oportunidades y seguimiento.
  const op = es('oportunidades');
  const nombreOp = String(op?.despues?.nombre ?? op?.antes?.nombre ?? conContexto.oportunidad ?? '');
  if (op?.accion === 'INSERT')
    return a({
      tipo: 'oportunidad',
      tono: 'info',
      verbo: 'creó la oportunidad',
      objeto: nombreOp,
      contexto: conContexto.cliente ?? '',
    });
  if (cambio(op, 'ejecutivo_id'))
    return a({
      tipo: 'oportunidad',
      tono: 'aviso',
      verbo: 'reasignó la oportunidad',
      objeto: nombreOp,
      contexto: `${valorAuditoria('ejecutivo_id', op?.antes?.ejecutivo_id, nombres) ?? '—'} → ${valorAuditoria('ejecutivo_id', op?.despues?.ejecutivo_id, nombres) ?? '—'}`,
    });
  if (cambio(op, 'estado_id'))
    return a({
      tipo: 'oportunidad',
      tono: 'info',
      verbo: 'cambió el estado de la oportunidad',
      objeto: nombreOp,
      contexto: `${valorAuditoria('estado_id', op?.antes?.estado_id, nombres) ?? '—'} → ${valorAuditoria('estado_id', op?.despues?.estado_id, nombres) ?? '—'}`,
    });
  if (op)
    return a({
      tipo: 'oportunidad',
      tono: 'neutro',
      verbo: 'editó la oportunidad',
      objeto: nombreOp,
      contexto: conContexto.cliente ?? '',
    });
  const seg = es('seguimiento');
  if (seg)
    return a({
      tipo: 'seguimiento',
      tono: 'neutro',
      verbo: seg.accion === 'INSERT' ? 'registró seguimiento en' : 'editó una nota de seguimiento en',
      objeto: conContexto.oportunidad,
      contexto: conContexto.cliente ?? '',
    });
  const colab = es('oportunidad_colaboradores');
  if (colab)
    return a({
      tipo: 'oportunidad',
      tono: 'neutro',
      verbo: colab.accion === 'DELETE' ? 'quitó un colaborador de' : 'agregó un colaborador a',
      objeto: conContexto.oportunidad,
      contexto: valorAuditoria('ejecutivo_id', (colab.despues ?? colab.antes)?.perfil_id, nombres) ?? '',
    });

  // Clientes y contactos.
  const cli = es('clientes');
  if (cli)
    return a({
      tipo: 'cliente',
      tono: cli.accion === 'INSERT' ? 'info' : 'neutro',
      verbo: cli.accion === 'INSERT' ? 'dio de alta al cliente' : 'editó el cliente',
      objeto: String((cli.despues ?? cli.antes)?.razon_social ?? ''),
      contexto: '',
    });
  const con = es('contactos');
  if (con)
    return a({
      tipo: 'cliente',
      tono: 'neutro',
      verbo:
        con.accion === 'INSERT'
          ? 'agregó el contacto'
          : con.accion === 'DELETE'
            ? 'quitó el contacto'
            : 'editó el contacto',
      objeto: [
        ((con.despues ?? con.antes)?.tratamiento as string) || null,
        String((con.despues ?? con.antes)?.nombre ?? ''),
      ]
        .filter(Boolean)
        .join(' '),
      contexto: conContexto.cliente ?? '',
    });

  // Usuarios, roles y permisos.
  const per = es('perfiles');
  if (per) {
    const nombre = String((per.despues ?? per.antes)?.nombre ?? '');
    if (per.accion === 'INSERT')
      return a({
        tipo: 'usuario',
        tono: 'aviso',
        verbo: 'dio de alta a',
        objeto: nombre,
        contexto: valorAuditoria('rol_id', per.despues?.rol_id, nombres) ?? '',
      });
    if (cambio(per, 'rol_id'))
      return a({
        tipo: 'usuario',
        tono: 'aviso',
        verbo: 'cambió el rol de',
        objeto: nombre,
        contexto: `${valorAuditoria('rol_id', per.antes?.rol_id, nombres)} → ${valorAuditoria('rol_id', per.despues?.rol_id, nombres)}`,
      });
    if (cambio(per, 'activo'))
      return a({
        tipo: 'usuario',
        tono: 'aviso',
        verbo: per.despues?.activo ? 'reactivó a' : 'desactivó a',
        objeto: nombre,
        contexto: '',
      });
    return a({ tipo: 'usuario', tono: 'neutro', verbo: 'editó los datos de', objeto: nombre, contexto: '' });
  }
  if (es('rol_permisos') || es('roles')) {
    const rol = String(
      (filas.find((f) => f.tabla === 'rol_permisos') ?? f0).despues?.rol_id ??
        (filas[0]?.antes?.rol_id as string) ??
        '',
    );
    return a({
      tipo: 'permisos',
      tono: 'aviso',
      verbo: 'modificó los permisos del rol',
      objeto: nombres.roles?.[rol] ?? rol,
      contexto: '',
    });
  }
  if (es('configuracion'))
    return a({ tipo: 'catalogo', tono: 'aviso', verbo: 'cambió la configuración general', contexto: '' });

  // Catálogos y paquetes.
  const paq = es('paquetes_condiciones');
  if (paq || es('paquete_condiciones')) {
    const nombre = String((paq?.despues ?? paq?.antes)?.nombre ?? '');
    const baja = paq?.accion === 'UPDATE' && paq.antes?.activo && !paq.despues?.activo;
    return a({
      tipo: 'catalogo',
      tono: baja ? 'aviso' : 'neutro',
      verbo: baja ? 'eliminó el paquete de condiciones' : 'guardó el paquete de condiciones',
      objeto: nombre || null,
      contexto: '',
    });
  }
  const cat = filas.find((f) => moduloDeTabla(f.tabla) === 'catalogos');
  if (cat) {
    const r = cat.despues ?? cat.antes ?? {};
    const nombre = String(r.nombre ?? r.codigo ?? r.id ?? '');
    const activo = cambio(cat, 'activo') ?? cambio(cat, 'activa');
    const soloOrden = cat.accion === 'UPDATE' && !base.cambios.length && cambio(cat, 'orden');
    const verbo =
      cat.accion === 'INSERT'
        ? 'agregó'
        : cat.accion === 'DELETE'
          ? 'quitó'
          : activo
            ? r.activo === false || r.activa === false
              ? 'desactivó'
              : 'reactivó'
            : soloOrden
              ? 'reordenó'
              : 'editó';
    return a({
      tipo: 'catalogo',
      tono: 'neutro',
      verbo: `${verbo} ${CATALOGOS_CON_ARTICULO[cat.tabla] ?? `un registro de ${cat.tabla}`}`,
      objeto: nombre.length > 60 ? `${nombre.slice(0, 60)}…` : nombre || null,
      contexto: filas.length > 1 ? plural(filas.length, 'registro', 'registros') : '',
    });
  }

  return a({
    verbo: `modificó ${plural(filas.length, 'registro', 'registros')} de`,
    objeto: etiquetaTabla(f0.tabla),
  });
}

// ───────────── Comparación de textos ─────────────

export type TramoTexto = { texto: string; tipo: 'igual' | 'quitado' | 'agregado' };

/** Diferencia palabra por palabra (subsecuencia común más larga), para resaltar qué cambió en un texto largo. */
export function diferenciaPalabras(
  antes: string,
  despues: string,
): { antes: TramoTexto[]; despues: TramoTexto[] } {
  const a = antes.split(/(\s+)/).filter(Boolean);
  const b = despues.split(/(\s+)/).filter(Boolean);
  // Textos muy largos: sin resaltado fino (evita una tabla enorme).
  if (a.length * b.length > 400_000)
    return { antes: [{ texto: antes, tipo: 'quitado' }], despues: [{ texto: despues, tipo: 'agregado' }] };
  // Tabla de la subsecuencia común más larga, en un solo arreglo: t(i, j) = celda [i][j].
  const ancho = b.length + 1;
  const tabla = new Int32Array((a.length + 1) * ancho);
  const t = (i: number, j: number) => tabla[i * ancho + j] ?? 0;
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      tabla[i * ancho + j] = a[i] === b[j] ? t(i + 1, j + 1) + 1 : Math.max(t(i + 1, j), t(i, j + 1));
  const ra: TramoTexto[] = [];
  const rb: TramoTexto[] = [];
  const poner = (lista: TramoTexto[], texto: string, tipo: TramoTexto['tipo']) => {
    const ultimo = lista[lista.length - 1];
    if (ultimo && ultimo.tipo === tipo) ultimo.texto += texto;
    else lista.push({ texto, tipo });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const x = a[i] ?? '';
    const y = b[j] ?? '';
    if (x === y) {
      poner(ra, x, 'igual');
      poner(rb, y, 'igual');
      i++;
      j++;
    } else if (t(i + 1, j) >= t(i, j + 1)) {
      poner(ra, x, 'quitado');
      i++;
    } else {
      poner(rb, y, 'agregado');
      j++;
    }
  }
  for (; i < a.length; i++) poner(ra, a[i] ?? '', 'quitado');
  for (; j < b.length; j++) poner(rb, b[j] ?? '', 'agregado');
  return { antes: ra, despues: rb };
}

// ───────────── Accesos ─────────────

export const EVENTOS_ACCESO: Record<string, { texto: string; tono: TonoAccion }> = {
  inicio: { texto: 'Inició sesión', tono: 'exito' },
  cierre: { texto: 'Cerró sesión', tono: 'neutro' },
  fallido: { texto: 'Contraseña incorrecta', tono: 'peligro' },
  bloqueo: { texto: 'Bloqueo por intentos', tono: 'peligro' },
  mfa_inscrito: { texto: 'Configuró su 2FA', tono: 'info' },
  mfa_restablecido: { texto: '2FA restablecida', tono: 'aviso' },
  recuperacion: { texto: 'Enlace de recuperación', tono: 'aviso' },
  invitacion: { texto: 'Invitación generada', tono: 'info' },
  desactivado: { texto: 'Usuario desactivado', tono: 'aviso' },
  reactivado: { texto: 'Usuario reactivado', tono: 'info' },
};

/** IP parcial: «189.203.xx.xx» (IPv6: los dos primeros bloques). */
export function ipParcial(ip: string | null): string {
  if (!ip) return '—';
  if (ip.includes('.')) {
    const p = ip.split('.');
    return p.length === 4 ? `${p[0]}.${p[1]}.xx.xx` : ip;
  }
  const p = ip.split(':').filter(Boolean);
  return p.length > 2 ? `${p[0]}:${p[1]}:…` : ip;
}

/** Red aproximada para comparar accesos: los dos primeros octetos (o bloques). */
export function redDeIp(ip: string | null): string | null {
  if (!ip) return null;
  return ip.includes('.') ? ip.split('.').slice(0, 2).join('.') : ip.split(':').slice(0, 2).join(':');
}

/** «Chrome · Windows» a partir del agente del navegador. */
export function dispositivoDeAgente(agente: string | null): string {
  if (!agente) return '—';
  const nav = /Edg\//.test(agente)
    ? 'Edge'
    : /OPR\//.test(agente)
      ? 'Opera'
      : /Firefox\//.test(agente)
        ? 'Firefox'
        : /Chrome\//.test(agente)
          ? 'Chrome'
          : /Safari\//.test(agente)
            ? 'Safari'
            : 'Otro navegador';
  const so = /iPhone|iPad/.test(agente)
    ? 'iPhone'
    : /Android/.test(agente)
      ? 'Android'
      : /Windows/.test(agente)
        ? 'Windows'
        : /Mac OS X/.test(agente)
          ? 'Mac'
          : /Linux/.test(agente)
            ? 'Linux'
            : 'otro sistema';
  return `${nav} · ${so}`;
}

export interface Acceso {
  id: number;
  en: string;
  usuarioId: string | null;
  correo: string | null;
  evento: string;
  ip: string | null;
  agente: string | null;
  /** Quien lo hizo cuando no es la propia cuenta (restablecer 2FA, generar enlaces, desactivar). */
  realizadoPor?: string | null;
}

/**
 * Marca los accesos desde una red que esa cuenta no había usado en los 30 días anteriores (se compara con lo que
 * se recibe: pásale al menos 60 días de historia). Devuelve los ids marcados.
 */
export function accesosDesdeRedNueva(accesos: Acceso[]): Set<number> {
  const orden = [...accesos].sort((x, y) => x.en.localeCompare(y.en));
  const vistas = new Map<string, { red: string; en: number }[]>();
  const nuevas = new Set<number>();
  const MES = 30 * 24 * 3600 * 1000;
  for (const a of orden) {
    const cuenta = a.usuarioId ?? a.correo ?? '';
    const red = redDeIp(a.ip);
    if (!cuenta || !red || a.evento !== 'inicio') continue;
    const t = new Date(a.en).getTime();
    const previas = vistas.get(cuenta) ?? [];
    const conocida = previas.some((p) => p.red === red && t - p.en <= MES);
    if (previas.length > 0 && !conocida) nuevas.add(a.id);
    previas.push({ red, en: t });
    vistas.set(cuenta, previas);
  }
  return nuevas;
}

/** Rachas de intentos fallidos de una misma cuenta (≥ 3 en 15 minutos), de la más reciente a la más antigua. */
export function rachasFallidas(
  accesos: Acceso[],
): { correo: string; intentos: number; desde: string; hasta: string; red: string | null }[] {
  const fallidos = accesos
    .filter((a) => a.evento === 'fallido' || a.evento === 'bloqueo')
    .sort((x, y) => x.en.localeCompare(y.en));
  const porCuenta = new Map<string, Acceso[]>();
  for (const a of fallidos) {
    const c = (a.correo ?? a.usuarioId ?? '—').toLowerCase();
    porCuenta.set(c, [...(porCuenta.get(c) ?? []), a]);
  }
  const rachas: { correo: string; intentos: number; desde: string; hasta: string; red: string | null }[] = [];
  for (const [correo, lista] of porCuenta) {
    // Tramos de intentos con no más de 15 minutos entre uno y el siguiente.
    const tramos: Acceso[][] = [];
    let anterior = -Infinity;
    for (const a of lista) {
      const t = new Date(a.en).getTime();
      const actual = tramos.at(-1);
      if (actual && t - anterior <= 15 * 60 * 1000) actual.push(a);
      else tramos.push([a]);
      anterior = t;
    }
    for (const tramo of tramos) {
      const primero = tramo[0];
      const ultimo = tramo.at(-1);
      if (tramo.length >= 3 && primero && ultimo)
        rachas.push({
          correo,
          intentos: tramo.length,
          desde: primero.en,
          hasta: ultimo.en,
          red: redDeIp(ultimo.ip),
        });
    }
  }
  return rachas.sort((x, y) => y.hasta.localeCompare(x.hasta));
}
