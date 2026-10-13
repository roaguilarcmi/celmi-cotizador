/**
 * Web Push sin dependencias (Fase 8, 2026-10-13): cifrado del mensaje (RFC 8291, «aes128gcm» de RFC 8188) y firma
 * VAPID (RFC 8292) con la criptografía estándar (WebCrypto), disponible en Node y en el navegador.
 * Sólo se usa en el servidor; la llave privada VAPID nunca sale de él.
 */

type Bytes = Uint8Array<ArrayBuffer>;

const sutil = () => globalThis.crypto.subtle;
const texto = (s: string): Bytes => new TextEncoder().encode(s) as Bytes;

export function aBase64Url(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function deBase64Url(s: string): Bytes {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  const r = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) r[i] = b.charCodeAt(i);
  return r as Bytes;
}

function unir(...partes: Uint8Array[]): Bytes {
  const r = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of partes) {
    r.set(p, i);
    i += p.length;
  }
  return r as Bytes;
}

async function hmac(llave: Bytes, datos: Bytes): Promise<Bytes> {
  const k = await sutil().importKey('raw', llave, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await sutil().sign('HMAC', k, datos)) as Bytes;
}

/** HKDF de un solo bloque (basta: se piden ≤ 32 bytes). */
async function hkdf(sal: Bytes, ikm: Bytes, info: Bytes, largo: number): Promise<Bytes> {
  const prk = await hmac(sal, ikm);
  return (await hmac(prk, unir(info, new Uint8Array([1])))).slice(0, largo);
}

/** Llave pública EC P-256 sin comprimir (65 bytes) → JWK (x, y). */
function jwkPublica(publica: Uint8Array): { x: string; y: string } {
  if (publica.length !== 65 || publica[0] !== 4) throw new Error('Llave pública P-256 no válida');
  return { x: aBase64Url(publica.slice(1, 33)), y: aBase64Url(publica.slice(33, 65)) };
}

export interface ClavesEc {
  /** Pública sin comprimir (65 bytes), base64url. */
  publica: string;
  /** Escalar privado `d` (32 bytes), base64url. */
  privada: string;
}

/** Par de llaves P-256 (para VAPID: la pública va al navegador; la privada, a .env.local / Netlify). */
export async function generarClaves(): Promise<ClavesEc> {
  const par = (await sutil().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const jwk = await sutil().exportKey('jwk', par.privateKey);
  const publica = new Uint8Array(await sutil().exportKey('raw', par.publicKey));
  if (!jwk.d) throw new Error('No se pudo exportar la llave');
  return { publica: aBase64Url(publica), privada: jwk.d };
}

/**
 * Cifra el mensaje para una suscripción (RFC 8291). `servidor` y `sal` sólo se fijan en pruebas; en uso real se
 * generan nuevos en cada envío.
 */
export async function cifrarMensaje(
  suscripcion: { p256dh: string; auth: string },
  mensaje: Uint8Array,
  prueba?: { servidor: ClavesEc; sal: string },
): Promise<Bytes> {
  const uaPublica = deBase64Url(suscripcion.p256dh);
  const secreto = deBase64Url(suscripcion.auth);
  const servidor = prueba?.servidor ?? (await generarClaves());
  const asPublica = deBase64Url(servidor.publica);
  const sal = prueba
    ? deBase64Url(prueba.sal)
    : (globalThis.crypto.getRandomValues(new Uint8Array(16)) as Bytes);
  if (mensaje.length > 3800) throw new Error('Mensaje demasiado largo');

  const privada = await sutil().importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d: servidor.privada, ...jwkPublica(asPublica), ext: true },
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  );
  const destino = await sutil().importKey('raw', uaPublica, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const compartido = new Uint8Array(
    await sutil().deriveBits({ name: 'ECDH', public: destino }, privada, 256),
  ) as Bytes;

  const ikm = await hkdf(secreto, compartido, unir(texto('WebPush: info\0'), uaPublica, asPublica), 32);
  const cek = await hkdf(sal, ikm, texto('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(sal, ikm, texto('Content-Encoding: nonce\0'), 12);

  const llave = await sutil().importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // Un solo registro: el mensaje y el delimitador 0x02 de último registro.
  const cifrado = new Uint8Array(
    await sutil().encrypt(
      { name: 'AES-GCM', iv: nonce, tagLength: 128 },
      llave,
      unir(mensaje, new Uint8Array([2])),
    ),
  );
  const tamanoRegistro = new Uint8Array([0, 0, 0x10, 0]); // 4096
  return unir(sal, tamanoRegistro, new Uint8Array([asPublica.length]), asPublica, cifrado);
}

/** Encabezado `Authorization` VAPID para el servicio de envío del navegador (FCM, Microsoft, Mozilla…). */
export async function encabezadoVapid(
  endpoint: string,
  vapid: ClavesEc,
  sujeto: string,
  ahora = Date.now(),
): Promise<string> {
  const audiencia = new URL(endpoint).origin;
  const cabecera = aBase64Url(texto(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const cuerpo = aBase64Url(
    texto(JSON.stringify({ aud: audiencia, exp: Math.floor(ahora / 1000) + 12 * 3600, sub: sujeto })),
  );
  const firmar = await sutil().importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d: vapid.privada, ...jwkPublica(deBase64Url(vapid.publica)), ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const firma = new Uint8Array(
    await sutil().sign({ name: 'ECDSA', hash: 'SHA-256' }, firmar, texto(`${cabecera}.${cuerpo}`)),
  );
  return `vapid t=${cabecera}.${cuerpo}.${aBase64Url(firma)}, k=${vapid.publica}`;
}
