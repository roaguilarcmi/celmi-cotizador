/**
 * Lo que guarda el paso «Partidas / Costos» del wizard (Fase 3B). Se valida en el servidor antes de llamar a
 * public.guardar_partidas; la base vuelve a validar (RLS, 5 decimales del tipo de cambio, cantidades enteras).
 */
import { z } from 'zod';
import { contenidoEnriquecidoSchema } from './enriquecido';
import { dinero, porcentaje, tipoCambio } from './numeros';

const uuid = z.uuid();
const opcionalUuid = z
  .union([uuid, z.literal('')])
  .nullable()
  .default(null);

export const costoCotizacionSchema = z.object({
  mayorista_id: opcionalUuid,
  moneda: z.string().regex(/^[A-Z]{3}$/, 'Moneda no válida'),
  costo_unitario: dinero,
  tipo_cambio: tipoCambio,
  vigencia: z.union([z.iso.date(), z.literal('')]).default(''),
});

/** Campos de una partida o de un adicional. */
const camposPartida = {
  id: uuid.optional(),
  /** Clave local (para referirse a partidas aún sin id, p. ej. en un prorrateo). */
  clave: z.string().max(80).default(''),
  sku: z.string().trim().max(60).default(''),
  marca_id: opcionalUuid,
  descripcion: z.string().trim().min(1, 'Cada partida necesita descripción').max(2000),
  descripcion_contenido: contenidoEnriquecidoSchema.nullable().default(null),
  entrega: z.string().trim().max(60).default(''),
  unidad_id: z.string().max(40).nullable().default(null),
  cantidad: z
    .number({ error: 'Cantidad no válida' })
    .int('Sólo cantidades enteras')
    .positive('La cantidad debe ser mayor que cero')
    .max(1_000_000),
  se_suma: z.boolean().default(false),
  oculta_al_cliente: z.boolean().default(false),
  /** null: aún sin costo (se puede guardar así, pero no enviar a autorización). */
  costo: costoCotizacionSchema.nullable().default(null),
};

/** Adicional de una partida (regla 2026-10-05): línea visible o incluido en el precio de su partida. */
export const componenteCotizacionSchema = z.object({
  ...camposPartida,
  presentacion: z.enum(['linea', 'incluida']).default('incluida'),
});

/** Partida de primer nivel, o cargo prorrateado (se reparte entre las partidas de «prorratear_entre»). */
export const partidaCotizacionSchema = z
  .object({
    ...camposPartida,
    presentacion: z.enum(['linea', 'prorrateada']).default('linea'),
    componentes: z.array(componenteCotizacionSchema).max(20, 'Máximo 20 adicionales por partida').default([]),
    prorratear_entre: z.array(z.string().max(80)).max(300).default([]),
  })
  .refine((p) => p.presentacion !== 'prorrateada' || p.componentes.length === 0, {
    message: 'Un cargo prorrateado no lleva adicionales',
  });

export const propuestaCotizacionSchema = z.object({
  id: uuid.optional(),
  nombre: z.string().trim().min(1, 'Cada propuesta necesita nombre').max(80),
  tipo: z.string().trim().max(40).default(''),
  es_adicional: z.boolean().default(false),
  partidas: z.array(partidaCotizacionSchema).max(300, 'Máximo 300 partidas por propuesta'),
});

export const propuestasCotizacionSchema = z
  .array(propuestaCotizacionSchema)
  .min(1, 'Debe haber al menos una propuesta')
  .max(20, 'Máximo 20 propuestas')
  .refine((ps) => ps.some((p) => !p.es_adicional), 'Debe haber al menos una propuesta principal');

export type PropuestaCotizacion = z.infer<typeof propuestaCotizacionSchema>;
export type PartidaCotizacion = z.infer<typeof partidaCotizacionSchema>;

/** Condiciones elegidas para una revisión, en orden (ajustables sólo para esa cotización). */
export const condicionesRevisionSchema = z
  .array(
    z.object({
      condicion_id: z
        .union([uuid, z.literal('')])
        .nullable()
        .default(null),
      contenido: contenidoEnriquecidoSchema,
    }),
  )
  .max(60, 'Máximo 60 condiciones');

const decimales = (n: number, mensaje: string) =>
  z
    .union([
      z.literal(''),
      z
        .string()
        .trim()
        .regex(new RegExp(`^\\d+(\\.\\d{1,${n}})?$`), mensaje),
    ])
    .default('');

/** Una fila de la propuesta de financiamiento: esquema y plazo con sus montos (se capturan, no se calculan). */
export const financiamientoSchema = z
  .array(
    z.object({
      propuesta_id: uuid,
      esquema_id: z.string().min(1).max(60),
      plazo_meses: z.number({ error: 'Plazo no válido' }).int('Plazo en meses enteros').min(1).max(240),
      mensualidad: decimales(2, 'Mensualidad con máximo 2 decimales'),
      valor_residual: decimales(2, 'Valor residual con máximo 2 decimales'),
      factor: decimales(6, 'Factor con máximo 6 decimales'),
      tasa_interes: decimales(4, 'Tasa con máximo 4 decimales'),
      gastos_apertura: decimales(2, 'Gastos con máximo 2 decimales'),
    }),
  )
  .max(500);

export type FinanciamientoCaptura = z.infer<typeof financiamientoSchema>[number];

/** Utilidad por partida que envía quien autoriza (Fase 3C): { [partida_id]: "13.5" }. Nunca negativa. */
export const utilidadesAutorizacionSchema = z.record(
  z.string().regex(/^[0-9a-f-]{36}$/i, 'Partida no válida'),
  porcentaje.refine((v) => Number(v) <= 99999, 'Utilidad demasiado alta'),
);

/** T.C. por moneda extranjera que fija quien autoriza (0020): { USD: "18.12345" }. */
export const tiposCambioAutorizacionSchema = z.record(
  z
    .string()
    .regex(/^[A-Z]{3}$/, 'Moneda no válida')
    .refine((m) => m !== 'MXN', 'El peso no lleva tipo de cambio'),
  tipoCambio,
);
