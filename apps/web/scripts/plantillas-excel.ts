/**
 * Incrusta las plantillas de Excel de CT e Ingram (lib/excel/plantillas) en lib/excel/plantillas.generado.ts, para
 * que viajen dentro del código del servidor (también al publicar en Netlify). Ejecutar al reemplazar una plantilla:
 *   npm run gen:plantillas -w @celmi/web
 * La de Ingram trae ~125 mil filas vacías con formato: se quitan las que están después de la fila 40.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { escribirZip, leerZip } from '../lib/excel/zip.ts';

const base = new URL('../lib/excel/plantillas/', import.meta.url);

function recortar(archivo: string, hoja: string, ultimaFila: number): Uint8Array {
  const a = leerZip(readFileSync(new URL(archivo, base)));
  const xml = new TextDecoder().decode(a.get(hoja));
  const recortado = xml.replace(
    /<row\b[^>]*?\br="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g,
    (fila, r: string) => (Number(r) > ultimaFila ? '' : fila),
  );
  a.set(hoja, new TextEncoder().encode(recortado));
  return escribirZip(a);
}

const ct = new Uint8Array(readFileSync(new URL('ct.xltx', base)));
const ingram = recortar('ingram.xlsx', 'xl/worksheets/sheet1.xml', 40);
const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64');
writeFileSync(
  new URL('plantillas.generado.ts', base.href.replace(/plantillas\/$/, '')),
  `// Generado por scripts/plantillas-excel.ts: no editar a mano.\n` +
    `export const PLANTILLA_CT = '${b64(ct)}';\n` +
    `export const PLANTILLA_INGRAM = '${b64(ingram)}';\n`,
);
console.log(`CT ${ct.length} bytes · Ingram ${ingram.length} bytes`);
