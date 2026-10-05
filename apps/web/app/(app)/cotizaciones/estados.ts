import type { EstadoRevision } from '@/lib/datos';

/** Nombre y tono de cada estado de revisión (compartido por servidor y cliente). */
export const ESTADOS: Record<
  EstadoRevision,
  { texto: string; tono: 'neutro' | 'aviso' | 'exito' | 'peligro' | 'info' }
> = {
  borrador: { texto: 'Borrador', tono: 'neutro' },
  pendiente_autorizacion: { texto: 'En autorización', tono: 'aviso' },
  autorizada: { texto: 'Autorizada', tono: 'exito' },
  rechazada: { texto: 'Rechazada', tono: 'peligro' },
  emitida: { texto: 'Emitida', tono: 'info' },
};
