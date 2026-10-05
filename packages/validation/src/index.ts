import { z } from 'zod';

/** Decimal en texto ("14533.46"); el texto evita errores de punto flotante entre cliente y servidor. */
export const decimalTexto = (maxDecimales: number) =>
  z
    .string()
    .trim()
    .regex(new RegExp(`^\\d+(\\.\\d{1,${maxDecimales}})?$`), `Número con hasta ${maxDecimales} decimales`);

export const dinero = decimalTexto(2);
export const tipoCambio = decimalTexto(6).refine(
  (v) => Number(v) > 0,
  'El tipo de cambio debe ser mayor que cero',
);
export const porcentaje = decimalTexto(4);

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
  esquema_id: z.string().trim().min(1).nullable().default(null),
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
export const tareaSchema = z.object({
  titulo: z.string().trim().min(2, 'Escribe qué hay que hacer').max(200),
  vence_en: z.iso.datetime({ offset: true, message: 'Elige la fecha y hora' }),
  /** Minutos de anticipación de cada aviso (varios por tarea; vacío = sin aviso). */
  avisos: z
    .array(z.number().int().min(0, 'Anticipación no válida').max(43_200, 'Máximo 30 días antes'))
    .max(6, 'Máximo 6 avisos por tarea')
    .default([])
    .transform((xs) => [...new Set(xs)].sort((a, b) => a - b)),
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
 * Subtarea (decisión 2026-10-05): como una tarea, pero la fecha es opcional y sin fecha no hay avisos.
 */
export const subtareaSchema = z
  .object({
    titulo: tituloSubtareaSchema,
    vence_en: z.iso.datetime({ offset: true, message: 'La fecha no es válida' }).nullable().default(null),
    avisos: tareaSchema.shape.avisos,
  })
  .refine((s) => s.vence_en !== null || s.avisos.length === 0, {
    message: 'Para programar avisos, ponle fecha a la subtarea',
    path: ['avisos'],
  });
