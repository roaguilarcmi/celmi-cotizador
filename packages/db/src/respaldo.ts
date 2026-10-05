/**
 * Formato de los respaldos (decisión 2026-10-05: el plan gratuito de Supabase no incluye respaldos automáticos).
 *
 * El contenido (JSON con todas las tablas) se comprime con gzip y se cifra con AES-256-GCM. La llave se deriva de la
 * clave `RESPALDO_CLAVE` con scrypt y una sal aleatoria por archivo. Archivo:
 *   «CELMIRSP1» (9 bytes) · sal (16) · iv (12) · etiqueta GCM (16) · datos cifrados
 * Todo con el módulo `node:crypto`: sin dependencias externas.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';

const FIRMA = Buffer.from('CELMIRSP1');

export interface Respaldo {
  version: 1;
  creado_en: string;
  /** Última migración aplicada cuando se hizo el respaldo (para restaurar sobre el mismo esquema). */
  migracion: string | null;
  tablas: Record<string, unknown[]>;
}

/** Mínimo razonable para la clave: es lo único que protege los datos si el archivo se extravía. */
export const LARGO_MINIMO_CLAVE = 16;

const llave = (clave: string, sal: Buffer) =>
  scryptSync(clave, sal, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

export function cifrarRespaldo(respaldo: Respaldo, clave: string): Buffer {
  if (clave.length < LARGO_MINIMO_CLAVE)
    throw new Error(`La clave de respaldo debe tener al menos ${LARGO_MINIMO_CLAVE} caracteres.`);
  const sal = randomBytes(16);
  const iv = randomBytes(12);
  const cifrador = createCipheriv('aes-256-gcm', llave(clave, sal), iv);
  const datos = Buffer.concat([cifrador.update(gzipSync(JSON.stringify(respaldo))), cifrador.final()]);
  return Buffer.concat([FIRMA, sal, iv, cifrador.getAuthTag(), datos]);
}

export function descifrarRespaldo(archivo: Buffer, clave: string): Respaldo {
  if (!archivo.subarray(0, FIRMA.length).equals(FIRMA))
    throw new Error('El archivo no es un respaldo de CELMI.');
  let i = FIRMA.length;
  const sal = archivo.subarray(i, (i += 16));
  const iv = archivo.subarray(i, (i += 12));
  const etiqueta = archivo.subarray(i, (i += 16));
  const descifrador = createDecipheriv('aes-256-gcm', llave(clave, sal), iv);
  descifrador.setAuthTag(etiqueta);
  let comprimido: Buffer;
  try {
    comprimido = Buffer.concat([descifrador.update(archivo.subarray(i)), descifrador.final()]);
  } catch {
    // GCM detecta tanto una clave equivocada como un archivo alterado.
    throw new Error('No se pudo descifrar: la clave no coincide o el archivo está dañado.');
  }
  const respaldo = JSON.parse(gunzipSync(comprimido).toString('utf8')) as Respaldo;
  if (respaldo.version !== 1) throw new Error('Versión de respaldo desconocida.');
  return respaldo;
}

/** «celmi-2026-10-05-1430.respaldo» en hora local (orden cronológico al ordenar por nombre). */
export function nombreDeRespaldo(fecha = new Date()) {
  const d = (n: number) => String(n).padStart(2, '0');
  return `celmi-${fecha.getFullYear()}-${d(fecha.getMonth() + 1)}-${d(fecha.getDate())}-${d(fecha.getHours())}${d(fecha.getMinutes())}.respaldo`;
}
