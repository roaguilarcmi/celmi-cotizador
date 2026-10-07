/**
 * Tipo general de una oportunidad (decisiones 2026-10-05 y 2026-10-07). Los esquemas específicos (VJM, Full Payout…) y
 * sus plazos se eligen por propuesta en el paso «Financiamiento» de la cotización.
 */
export type TipoOportunidad = 'adquisicion' | 'arrendamiento' | 'credito_simple';

export const TIPOS_OPORTUNIDAD: Record<TipoOportunidad, { nombre: string; descripcion: string }> = {
  adquisicion: {
    nombre: 'Adquisición',
    descripcion: 'Compra-venta: pago total o anticipo y resto previo a la entrega.',
  },
  arrendamiento: {
    nombre: 'Arrendamiento',
    descripcion: 'Financiado. Los esquemas (VJM, Full Payout…) y plazos se eligen por propuesta al cotizar.',
  },
  credito_simple: {
    nombre: 'Crédito simple',
    descripcion:
      'El cliente adquiere el equipo y lo paga a plazos. Los plazos se eligen por propuesta al cotizar.',
  },
};
