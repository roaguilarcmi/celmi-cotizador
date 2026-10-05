// Comprueba que un respaldo se puede abrir: lo descifra y cuenta los registros de cada tabla. No toca la base.
// Uso: npm run respaldo:verificar -w @celmi/db [-- ruta\al\archivo.respaldo]   (sin ruta: el más reciente)
import { readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { descifrarRespaldo } from '../src/respaldo.ts';

const clave = process.env.RESPALDO_CLAVE;
const carpeta = process.env.RESPALDOS_DIR || join(homedir(), 'Documents', 'Respaldos CELMI');
if (!clave) {
  console.error('Falta RESPALDO_CLAVE en packages/db/.env.local.');
  process.exit(1);
}

let ruta = process.argv[2];
if (!ruta) {
  const ultimo = readdirSync(carpeta)
    .filter((n) => n.endsWith('.respaldo'))
    .sort()
    .at(-1);
  if (!ultimo) {
    console.error(`No hay respaldos en ${carpeta}.`);
    process.exit(1);
  }
  ruta = join(carpeta, ultimo);
}

const r = descifrarRespaldo(readFileSync(ruta), clave);
console.log(
  `${ruta}\nCreado: ${new Date(r.creado_en).toLocaleString('es-MX')} · esquema hasta ${r.migracion}\n`,
);
let total = 0;
for (const [tabla, filas] of Object.entries(r.tablas)) {
  total += filas.length;
  if (filas.length) console.log(`  ${tabla.padEnd(36)} ${String(filas.length).padStart(6)}`);
}
console.log(`\n✔ Respaldo íntegro: ${Object.keys(r.tablas).length} tablas, ${total} registros.`);
