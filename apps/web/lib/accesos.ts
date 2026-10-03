import { headers } from 'next/headers';
import { clienteAdmin } from './supabase/admin';

export type EventoAcceso =
  | 'inicio'
  | 'cierre'
  | 'fallido'
  | 'mfa_inscrito'
  | 'mfa_restablecido'
  | 'recuperacion'
  | 'bloqueo'
  | 'invitacion'
  | 'desactivado'
  | 'reactivado';

/** Registra un evento de acceso (RFP §32). No interrumpe el flujo si el registro falla. */
export async function registrarAcceso(
  evento: EventoAcceso,
  datos: { usuarioId?: string; correo?: string; realizadoPor?: string },
) {
  try {
    const h = await headers();
    await clienteAdmin()
      .from('accesos')
      .insert({
        evento,
        usuario_id: datos.usuarioId ?? null,
        correo: datos.correo ?? null,
        realizado_por: datos.realizadoPor ?? null,
        ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
        agente: h.get('user-agent')?.slice(0, 300) ?? null,
      });
  } catch (e) {
    console.error('No se pudo registrar el acceso', evento, e);
  }
}
