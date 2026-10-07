/** Motivos y presentación de una revisión (decisiones 2026-10-02 y 2026-10-07; migración 0026). */

export type MotivoRevision = 'inicial' | 'solicitud_cliente' | 'mejora_precio' | 'error_captura';
export type VisibilidadRevision = 'nuevo_folio' | 'visible' | 'interna';

export const MOTIVOS_REVISION: Record<MotivoRevision, { nombre: string; ayuda: string }> = {
  inicial: { nombre: 'Original', ayuda: '' },
  solicitud_cliente: {
    nombre: 'Solicitud del cliente',
    ayuda: 'Cambios que pide el cliente: cantidades, equipos, condiciones…',
  },
  mejora_precio: {
    nombre: 'Mejora de precio',
    ayuda:
      'El mayorista mejoró su costo o con otro mayorista tiene mejor precio. El costo actual queda como «Precio anterior» para ver la mejora.',
  },
  error_captura: {
    nombre: 'Error de captura',
    ayuda: 'Corrige un error cometido por el capturista.',
  },
};

export const VISIBILIDADES_REVISION: Record<VisibilidadRevision, { nombre: string; ayuda: string }> = {
  nuevo_folio: {
    nombre: 'Nuevo folio de cotización',
    ayuda: 'Se emite como una cotización nueva, con su propio folio.',
  },
  visible: {
    nombre: 'Rev visible para el cliente',
    ayuda: 'Aparece en la cotización como «Rev A», «Rev B»…',
  },
  interna: {
    nombre: 'Rev interna',
    ayuda: 'El cliente no la ve, pero el registro queda en el sistema.',
  },
};
