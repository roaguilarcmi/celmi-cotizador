import { z } from 'zod';

import { dinero, porcentaje, tipoCambio } from './numeros';

export * from './numeros';

export const monedaSchema = z.enum(['MXN', 'USD']);

/** Datos de costo que captura el ejecutivo para una partida. */
export const costoPartidaSchema = z.object({
  sku: z.string().trim().min(1, 'Captura el SKU'),
  mayorista: z.string().trim().min(1, 'Selecciona el mayorista'),
  cantidad: z.number().int().positive('La cantidad debe ser mayor que cero'),
  moneda: monedaSchema,
  costoUnitario: dinero,
});

/** Lo que define el autorizador sobre una partida. */
export const autorizacionPartidaSchema = z.object({
  tipoCambio: tipoCambio.default('1'),
  utilidadPct: porcentaje,
});

/** Alta de usuario por el administrador. */
export const altaUsuarioSchema = z.object({
  correo: z.string().trim().toLowerCase().pipe(z.email('Escribe un correo válido')),
  nombre: z.string().trim().min(3, 'Escribe el nombre completo').max(120),
  puesto: z.string().trim().max(80).default(''),
  rol: z.string().trim().min(1, 'Elige un rol'),
});

export type AltaUsuario = z.infer<typeof altaUsuarioSchema>;

const textoOpcional = (max: number) => z.string().trim().max(max).default('');

/** Cliente (razón social y datos generales). */
export const clienteSchema = z.object({
  razon_social: z.string().trim().min(2, 'Escribe la razón social o empresa').max(200),
  rfc: z
    .string()
    .trim()
    .toUpperCase()
    .max(13, 'El RFC tiene a lo más 13 caracteres')
    .default('')
    .transform((v) => v || null),
  direccion: textoOpcional(300),
  ciudad: textoOpcional(120),
});

/** Persona de contacto de un cliente. */
export const contactoSchema = z.object({
  tratamiento: textoOpcional(20),
  nombre: z.string().trim().min(2, 'Escribe el nombre del contacto').max(160),
  puesto: textoOpcional(120),
  correo: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .default('')
    .refine((v) => v === '' || z.email().safeParse(v).success, 'Escribe un correo válido'),
  telefono: textoOpcional(40),
});

/** Datos de una oportunidad (paso 1 del wizard). */
export const oportunidadSchema = z.object({
  cliente_id: z.uuid('Elige un cliente'),
  contacto_id: z.uuid().nullable().default(null),
  nombre: z.string().trim().min(3, 'Escribe el nombre o descripción del proyecto').max(200),
  /** Tipo general (2026-10-05); los esquemas específicos se eligen por propuesta. */
  tipo: z.enum(['adquisicion', 'arrendamiento']).default('arrendamiento'),
  ciudad_entrega: textoOpcional(160),
  observaciones_internas: textoOpcional(2000),
});

/** Nota de seguimiento. */
export const notaSchema = z.object({
  tipo: z.enum(['nota', 'llamada', 'visita', 'correo']),
  texto: z.string().trim().min(2, 'Escribe la nota').max(2000),
});

/**
 * Tarea personal (decisiones 2026-10-05: sólo para uno mismo, varios avisos, notas con formato).
 * `vence_en` llega en ISO 8601 (el navegador convierte su hora local). Las notas se validan aparte con
 * `leerContenido`.
 */
export const tareaSchema = z
  .object({
    titulo: z.string().trim().min(2, 'Escribe qué hay que hacer').max(200),
    /** Fecha opcional (decisión 2026-10-05: puede haber tareas sin horario programado). */
    vence_en: z.iso.datetime({ offset: true, message: 'La fecha no es válida' }).nullable().default(null),
    /** Con fecha pero sin hora: vence al final del día y sólo admite avisos de días antes. */
    sin_hora: z.boolean().default(false),
    /** Minutos de anticipación de cada aviso (varios por tarea; vacío = sin aviso). */
    avisos: z
      .array(z.number().int().min(0, 'Anticipación no válida').max(43_200, 'Máximo 30 días antes'))
      .max(6, 'Máximo 6 avisos por tarea')
      .default([])
      .transform((xs) => [...new Set(xs)].sort((a, b) => a - b)),
  })
  .refine((t) => t.vence_en !== null || (t.avisos.length === 0 && !t.sin_hora), {
    message: 'Para programar avisos, ponle fecha a la tarea',
    path: ['avisos'],
  })
  .refine((t) => !t.sin_hora || t.avisos.every((m) => m % 1440 === 0), {
    message: 'Sin hora, los avisos sólo pueden ser con días de anticipación',
    path: ['avisos'],
  });

export type Cliente = z.infer<typeof clienteSchema>;
export type Contacto = z.infer<typeof contactoSchema>;
export type DatosOportunidad = z.infer<typeof oportunidadSchema>;
export type CostoPartida = z.infer<typeof costoPartidaSchema>;
export type AutorizacionPartida = z.infer<typeof autorizacionPartidaSchema>;

export * from './enriquecido';

/**
 * Borradores (decisión 2026-10-05): registros a medias que se guardan para continuarlos. Son permisivos (pueden estar
 * incompletos) pero acotados; el texto con formato se valida aparte con `leerContenido`.
 */
export const borradorTareaSchema = z.object({
  titulo: z.string().max(200).default(''),
  fecha: z.union([z.iso.date(), z.literal('')]).default(''),
  hora: z.union([z.iso.time({ precision: -1 }), z.literal('')]).default(''),
  avisos: z.array(z.number().int().min(0).max(43_200)).max(6).default([]),
  subtareas: z.array(z.string().max(200)).max(30).default([]),
  con_fecha: z.boolean().default(true),
  /** Oportunidad elegida al crear desde «Mis tareas» (vacío = sin oportunidad). */
  oportunidad: z.union([z.uuid(), z.literal('')]).default(''),
});

export const borradorNotaSchema = z.object({
  tipo: z.enum(['nota', 'llamada', 'visita', 'correo']).default('nota'),
});

/** Máximo de subtareas por tarea. */
export const MAX_SUBTAREAS = 30;

/** Título de subtarea (al agregarla rápido, como en Asana: sólo el título). */
export const tituloSubtareaSchema = z.string().trim().min(2, 'Escribe la subtarea').max(200);

/** Subtareas capturadas al crear la tarea principal. */
export const subtareasNuevasSchema = z
  .array(tituloSubtareaSchema)
  .max(MAX_SUBTAREAS, 'Máximo 30 subtareas')
  .default([]);

/**
 * Subtarea: mismas reglas que una tarea (desde 2026-10-05 ambas tienen fecha opcional).
 */
export const subtareaSchema = tareaSchema;
export * from './pegado';
export * from './cotizacion';
