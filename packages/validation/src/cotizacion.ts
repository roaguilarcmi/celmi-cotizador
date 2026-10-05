/**
 * Lo que guarda el paso «Partidas / Costos» del wizard (Fase 3B). Se valida en el servidor antes de llamar a
 * public.guardar_partidas; la base vuelve a validar (RLS, 5 decimales del tipo de cambio, cantidades enteras).
 */
import { z } from 'zod';
import { contenidoEnriquecidoSchema } from './enriquecido';
import { dinero, tipoCambio } from './numeros';

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

export const partidaCotizacionSchema = z.object({
  id: uuid.optional(),
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
