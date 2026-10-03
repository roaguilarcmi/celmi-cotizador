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

export type CostoPartida = z.infer<typeof costoPartidaSchema>;
export type AutorizacionPartida = z.infer<typeof autorizacionPartidaSchema>;
