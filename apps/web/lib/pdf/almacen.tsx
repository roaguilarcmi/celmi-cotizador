import { renderToBuffer } from '@react-pdf/renderer';
import { clienteAdmin } from '@/lib/supabase/admin';
import { CotizacionPdf } from './CotizacionPdf';
import type { DatosPdf } from './datos-pdf';

/**
 * Copia del PDF emitido (Fase 4 · C): se guarda una sola vez al emitir, en un depósito privado de Supabase Storage
 * (plan gratuito, 1 GB). Sin reglas de acceso: sólo el servidor lo lee y escribe con la clave secreta, siempre después
 * de comprobar con la sesión de quien lo pide (RLS) que puede ver la cotización. Así, quien descarga recibe
 * exactamente el documento que se envió al cliente.
 */
const DEPOSITO = 'cotizaciones-emitidas';

export const rutaPdf = (cotizacionId: string, revisionId: string) => `${cotizacionId}/${revisionId}.pdf`;

export async function generarPdf(datos: DatosPdf): Promise<Uint8Array> {
  return new Uint8Array(await renderToBuffer(<CotizacionPdf d={datos} />));
}

async function asegurarDeposito() {
  const admin = clienteAdmin();
  const { data } = await admin.storage.getBucket(DEPOSITO);
  if (!data) {
    const { error } = await admin.storage.createBucket(DEPOSITO, {
      public: false,
      fileSizeLimit: '10MB',
      allowedMimeTypes: ['application/pdf'],
    });
    if (error && !/already exists/i.test(error.message)) throw error;
  }
  return admin;
}

/** Guarda la copia emitida; si ya existe, no se reemplaza (el documento emitido no cambia). */
export async function guardarPdf(ruta: string, bytes: Uint8Array): Promise<void> {
  const admin = await asegurarDeposito();
  const { error } = await admin.storage
    .from(DEPOSITO)
    .upload(ruta, bytes, { contentType: 'application/pdf', upsert: false });
  if (error && !/exists|duplicate/i.test(error.message)) throw error;
}

export async function leerPdf(ruta: string): Promise<Uint8Array | null> {
  const admin = await asegurarDeposito();
  const { data, error } = await admin.storage.from(DEPOSITO).download(ruta);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}
