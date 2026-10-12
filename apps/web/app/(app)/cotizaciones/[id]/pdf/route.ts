import { generarPdf, guardarPdf, leerPdf, rutaPdf } from '@/lib/pdf/almacen';
import { armarDatosPdf } from '@/lib/pdf/datos-pdf';
import { exigirPermiso } from '@/lib/sesion';

export const dynamic = 'force-dynamic';

const esUuid = (v: string | null): v is string => Boolean(v) && /^[0-9a-f-]{36}$/i.test(v ?? '');

/** Nombre del archivo como los que ya usa CELMI: «COT. CELMISOLUTIONS - CLIENTE - folio.pdf». */
const nombreArchivo = (empresa: string, folio: string | null) =>
  `COT. CELMISOLUTIONS - ${empresa || 'CLIENTE'} - ${folio ? folio.replace(/^CELMISOLUTIONS-/, '') : 'VISTA PREVIA'}.pdf`
    .replace(/[\\/:*?"<>|\r\n]+/g, ' ')
    .slice(0, 150);

/**
 * PDF de una revisión (Fase 4 · C). Autorizada: vista previa con marca de agua, sin folio. Emitida: la copia guardada
 * al emitir (si faltara, se vuelve a generar con los datos congelados y se guarda). La sesión y RLS deciden el acceso.
 */
export async function GET(peticion: Request, { params }: { params: Promise<{ id: string }> }) {
  await exigirPermiso('pdf.emitir');
  const { id } = await params;
  const url = new URL(peticion.url);
  const revisionId = url.searchParams.get('revision');
  if (!esUuid(id) || !esUuid(revisionId)) return new Response('Solicitud no válida', { status: 400 });

  const armado = await armarDatosPdf(id, revisionId);
  if (!armado)
    return new Response('No se encontró la cotización o aún no tiene precios autorizados', { status: 404 });
  const { datos, revision } = armado;

  let bytes: Uint8Array;
  if (revision.estado === 'emitida') {
    const ruta = rutaPdf(id, revision.id);
    const guardado = await leerPdf(ruta);
    if (guardado) bytes = guardado;
    else {
      // La copia es la emitida, sin la marca de cancelada.
      bytes = await generarPdf({ ...datos, cancelada: false });
      await guardarPdf(ruta, bytes);
    }
  } else if (revision.estado === 'autorizada') {
    bytes = await generarPdf(datos);
  } else {
    return new Response('La vista previa existe cuando los precios están autorizados', { status: 409 });
  }

  const nombre = nombreArchivo(datos.destinatario.empresa, datos.folio);
  const ascii = nombre.normalize('NFD').replace(/[^\x20-\x7e]/g, '');
  return new Response(new Blob([bytes as BlobPart], { type: 'application/pdf' }), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${url.searchParams.get('descargar') ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
