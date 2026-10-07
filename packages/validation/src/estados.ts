import { z } from 'zod';

/** Estados de la República (decisión 2026-10-07; la base tiene la misma lista en app.estados_mx()). */
export const ESTADOS_MX = [
  'Aguascalientes',
  'Baja California',
  'Baja California Sur',
  'Campeche',
  'Chiapas',
  'Chihuahua',
  'Ciudad de México',
  'Coahuila',
  'Colima',
  'Durango',
  'Estado de México',
  'Guanajuato',
  'Guerrero',
  'Hidalgo',
  'Jalisco',
  'Michoacán',
  'Morelos',
  'Nayarit',
  'Nuevo León',
  'Oaxaca',
  'Puebla',
  'Querétaro',
  'Quintana Roo',
  'San Luis Potosí',
  'Sinaloa',
  'Sonora',
  'Tabasco',
  'Tamaulipas',
  'Tlaxcala',
  'Veracruz',
  'Yucatán',
  'Zacatecas',
] as const;

export type EstadoMx = (typeof ESTADOS_MX)[number];

/** Zona de entrega habitual: fuera de ella, la autorización avisa a quien autoriza. */
export const ZONA_ENTREGA: readonly EstadoMx[] = [
  'Ciudad de México',
  'Estado de México',
  'Hidalgo',
  'Morelos',
];

export const fueraDeZona = (estado: string | null | undefined) =>
  !estado || !(ZONA_ENTREGA as readonly string[]).includes(estado);

/** Estado opcional: '' → null. */
export const estadoMx = z
  .union([z.literal(''), z.enum(ESTADOS_MX, 'Elige un estado de la lista')])
  .default('')
  .transform((v) => (v === '' ? null : v));
