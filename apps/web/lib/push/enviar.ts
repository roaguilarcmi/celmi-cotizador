import {
  CATEGORIAS,
  CUERPO_SEGURO,
  endpointPermitido,
  leerPreferenciasAvisos,
  TITULOS_SEGUROS,
} from '../avisos';
import { clienteAdmin } from '../supabase/admin';
import { cifrarMensaje, encabezadoVapid, type ClavesEc } from './cifrado';

/*
 * Envío de avisos de Windows con el sitio cerrado (Web Push, Fase 8). Corre en el servidor después de cada página
 * (`after` en el layout): toma los avisos que aún no se enviaron, los marca (así dos peticiones no envían el mismo)
 * y los manda cifrados a las suscripciones de su destinatario. Sólo viaja un título genérico (TITULOS_SEGUROS), el
 * tipo y el enlace interno; nunca clientes, folios ni montos (decisión 2026-10-13).
 */

const VIGENCIA_MS = 24 * 3600 * 1000;

function clavesVapid(): ClavesEc | null {
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privada = process.env.VAPID_PRIVATE_KEY?.trim();
  return publica && privada ? { publica, privada } : null;
}

export const pushConfigurado = () => clavesVapid() !== null;

interface Pendiente {
  id: string;
  destinatario_id: string;
  tipo: string;
  enlace: string;
}

interface Suscripcion {
  id: string;
  usuario_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function despacharAvisosPush(): Promise<void> {
  const vapid = clavesVapid();
  if (!vapid || !process.env.SUPABASE_SECRET_KEY) return;
  try {
    const admin = clienteAdmin();
    const { data: avisos, error } = await admin
      .from('notificaciones')
      .update({ push_enviado_en: new Date().toISOString() })
      .is('push_enviado_en', null)
      .gte('creado_en', new Date(Date.now() - VIGENCIA_MS).toISOString())
      .select('id, destinatario_id, tipo, enlace');
    if (error || !avisos?.length) return;
    const pendientes = avisos as Pendiente[];
    const destinatarios = [...new Set(pendientes.map((a) => a.destinatario_id))];
    const [{ data: subs }, { data: perfiles }] = await Promise.all([
      admin
        .from('suscripciones_push')
        .select('id, usuario_id, endpoint, p256dh, auth')
        .in('usuario_id', destinatarios),
      admin.from('perfiles').select('id, preferencias, activo').in('id', destinatarios),
    ]);
    const prefs = new Map(
      ((perfiles ?? []) as { id: string; preferencias: unknown; activo: boolean }[]).map((p) => [
        p.id,
        { ...leerPreferenciasAvisos(p.preferencias), activo: p.activo },
      ]),
    );
    const sujeto = process.env.SITIO_URL?.trim() || 'https://celmi-solutions.netlify.app';

    await Promise.all(
      pendientes.flatMap((a) => {
        const p = prefs.get(a.destinatario_id);
        const categoria = CATEGORIAS[a.tipo];
        if (!p?.activo || (categoria && !p[categoria])) return [];
        const mensaje = new TextEncoder().encode(
          JSON.stringify({
            titulo: TITULOS_SEGUROS[a.tipo] ?? 'Tienes un aviso nuevo',
            cuerpo: CUERPO_SEGURO,
            enlace: a.enlace.startsWith('/') ? a.enlace : '/',
            etiqueta: `aviso-${a.id}`,
            sonido: p.sonido,
          }),
        );
        return ((subs ?? []) as Suscripcion[])
          .filter((s) => s.usuario_id === a.destinatario_id && endpointPermitido(s.endpoint))
          .map((s) => enviar(s, mensaje, vapid, sujeto));
      }),
    );
  } catch (e) {
    console.error('[push] No se pudieron enviar los avisos', e instanceof Error ? e.message : e);
  }
}

async function enviar(s: Suscripcion, mensaje: Uint8Array, vapid: ClavesEc, sujeto: string) {
  try {
    const cuerpo = await cifrarMensaje(s, mensaje);
    const r = await fetch(s.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await encabezadoVapid(s.endpoint, vapid, sujeto),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(VIGENCIA_MS / 1000),
        Urgency: 'normal',
      },
      body: cuerpo,
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    const admin = clienteAdmin();
    // 404/410: la suscripción ya no existe (se quitó el permiso o se borró el navegador).
    if (r.status === 404 || r.status === 410) await admin.from('suscripciones_push').delete().eq('id', s.id);
    else if (r.ok)
      await admin
        .from('suscripciones_push')
        .update({ ultimo_envio: new Date().toISOString() })
        .eq('id', s.id);
    else console.error(`[push] El servicio respondió ${r.status}`);
  } catch (e) {
    console.error('[push] Envío fallido', e instanceof Error ? e.message : e);
  }
}
