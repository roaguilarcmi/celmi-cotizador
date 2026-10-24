import { deflateRawSync, inflateRawSync } from 'node:zlib';

/**
 * ZIP mínimo para leer y escribir archivos de Excel (.xlsx/.xltx son un ZIP con XML) sin dependencias
 * (2026-10-23): sólo «stored» (0) y «deflate» (8), sin cifrado ni ZIP64, que es lo que usa Excel. Sólo servidor.
 */

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of datos) c = (TABLA_CRC[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Archivos del ZIP por ruta (en el orden en que vienen). */
export type ArchivosZip = Map<string, Uint8Array>;

const MAX_DESCOMPRIMIDO = 50 * 1024 * 1024;

export function leerZip(zip: Uint8Array): ArchivosZip {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  // Fin del directorio central: firma 0x06054b50, buscando desde el final (puede haber comentario).
  let fin = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--)
    if (v.getUint32(i, true) === 0x06054b50) {
      fin = i;
      break;
    }
  if (fin < 0) throw new Error('No es un archivo ZIP válido');
  const total = v.getUint16(fin + 10, true);
  let p = v.getUint32(fin + 16, true);
  const archivos: ArchivosZip = new Map();
  let suma = 0;
  for (let n = 0; n < total; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('Directorio del ZIP dañado');
    const metodo = v.getUint16(p + 10, true);
    const comprimido = v.getUint32(p + 20, true);
    const tamano = v.getUint32(p + 24, true);
    const largoNombre = v.getUint16(p + 28, true);
    const largoExtra = v.getUint16(p + 30, true);
    const largoComentario = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const nombre = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + largoNombre));
    p += 46 + largoNombre + largoExtra + largoComentario;
    if (nombre.endsWith('/')) continue;
    if (nombre.includes('..') || nombre.startsWith('/')) throw new Error('Ruta no válida dentro del ZIP');
    suma += tamano;
    if (suma > MAX_DESCOMPRIMIDO) throw new Error('El archivo es demasiado grande');
    const inicio = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const crudo = zip.subarray(inicio, inicio + comprimido);
    const datos =
      metodo === 0
        ? new Uint8Array(crudo)
        : metodo === 8
          ? new Uint8Array(inflateRawSync(crudo, { maxOutputLength: MAX_DESCOMPRIMIDO }))
          : (() => {
              throw new Error('Compresión no soportada');
            })();
    archivos.set(nombre, datos);
  }
  return archivos;
}

export function escribirZip(archivos: ArchivosZip): Uint8Array {
  const locales: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let desplazamiento = 0;
  // Fecha fija de MS-DOS (1 ene 2026, 00:00): el contenido no depende de la hora.
  const fechaDos = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const [nombre, datos] of archivos) {
    const n = new TextEncoder().encode(nombre);
    const comprimido = new Uint8Array(deflateRawSync(datos, { level: 6 }));
    const crc = crc32(datos);
    const l = new Uint8Array(30 + n.length);
    const lv = new DataView(l.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // nombres en UTF-8
    lv.setUint16(8, 8, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, fechaDos, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, comprimido.length, true);
    lv.setUint32(22, datos.length, true);
    lv.setUint16(26, n.length, true);
    l.set(n, 30);
    locales.push(l, comprimido);

    const c = new Uint8Array(46 + n.length);
    const cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 8, true);
    cv.setUint16(14, fechaDos, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, comprimido.length, true);
    cv.setUint32(24, datos.length, true);
    cv.setUint16(28, n.length, true);
    cv.setUint32(42, desplazamiento, true);
    c.set(n, 46);
    central.push(c);
    desplazamiento += l.length + comprimido.length;
  }
  const tamCentral = central.reduce((s, c) => s + c.length, 0);
  const fin = new Uint8Array(22);
  const fv = new DataView(fin.buffer);
  fv.setUint32(0, 0x06054b50, true);
  fv.setUint16(8, archivos.size, true);
  fv.setUint16(10, archivos.size, true);
  fv.setUint32(12, tamCentral, true);
  fv.setUint32(16, desplazamiento, true);
  const partes = [...locales, ...central, fin];
  const r = new Uint8Array(partes.reduce((s, x) => s + x.length, 0));
  let i = 0;
  for (const x of partes) {
    r.set(x, i);
    i += x.length;
  }
  return r;
}

export const texto = (b: Uint8Array | undefined) => (b ? new TextDecoder().decode(b) : '');
export const bytes = (s: string) => new TextEncoder().encode(s);
