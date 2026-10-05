/**
 * Tipo general de una oportunidad (decisión 2026-10-05). Los esquemas específicos (VJM, Full Payout, crédito simple…)
 * y sus plazos se eligen por propuesta en el paso «Financiamiento» de la cotización.
 */
export type TipoOportunidad = 'adquisicion' | 'arrendamiento';

export const TIPOS_OPORTUNIDAD: Record<TipoOportunidad, { nombre: string; descripcion: string }> = {
  adquisicion: {
    nombre: 'Adquisición',
    descripcion: 'Compra-venta: pago total o anticipo y resto previo a la entrega.',
  },
  arrendamiento: {
    nombre: 'Arrendamiento',
    descripcion:
      'Financiado. Los esquemas (VJM, Full Payout, crédito…) y plazos se eligen por propuesta al cotizar.',
  },
};
