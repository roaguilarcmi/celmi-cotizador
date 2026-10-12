'use client';

/**
 * Extrae los textos de un PDF dentro del navegador (decisión 2026-10-12): el archivo nunca se sube ni se guarda; sólo
 * se lee para llenar la opción de financiamiento. pdf.js corre en un worker propio (mismo origen).
 */

/** Las corridas de las financieras pesan cientos de KB; más de esto no es una corrida. */
const MAXIMO_BYTES = 5 * 1024 * 1024;
const MAXIMO_PAGINAS = 10;

export async function textosDePdf(archivo: File): Promise<string[]> {
  if (archivo.size > MAXIMO_BYTES)
    throw new Error('El PDF pesa más de 5 MB; no parece una cotización de financiera.');
  const datos = new Uint8Array(await archivo.arrayBuffer());
  // Firma de PDF («%PDF-») en lugar de confiar en la extensión.
  if (String.fromCharCode(...datos.slice(0, 5)) !== '%PDF-') throw new Error('El archivo no es un PDF.');

  const pdfjs = await import('pdfjs-dist');
  if (!pdfjs.GlobalWorkerOptions.workerPort) {
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(
      new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url),
      { type: 'module' },
    );
  }
  // pdf.js 6 ya no usa `eval`; sin fuentes ni formularios XFA: sólo se lee el texto.
  const tarea = pdfjs.getDocument({ data: datos, disableFontFace: true, enableXfa: false });
  try {
    const doc = await tarea.promise;
    const textos: string[] = [];
    for (let i = 1; i <= Math.min(doc.numPages, MAXIMO_PAGINAS); i++) {
      const contenido = await (await doc.getPage(i)).getTextContent();
      for (const x of contenido.items) if ('str' in x) textos.push(x.str);
    }
    return textos;
  } finally {
    await tarea.destroy();
  }
}
