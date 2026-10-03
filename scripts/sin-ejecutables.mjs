// Política de TI de CELMI: las dependencias no deben traer ejecutables propios (.exe).
// Microsoft Defender bloquea binarios poco comunes; además son una vía de riesgo en la cadena de suministro.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const PROHIBIDAS = /\.(exe|com|scr|msi)$/i;
const encontrados = [];

function recorrer(dir) {
  let entradas;
  try {
    entradas = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entradas) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) recorrer(ruta);
    else if (PROHIBIDAS.test(e.name)) encontrados.push(ruta);
  }
}

for (const raiz of ['node_modules', 'apps/web/node_modules', 'packages']) recorrer(raiz);

if (encontrados.length) {
  console.error('Se encontraron ejecutables en las dependencias (prohibido por la política de TI):');
  for (const r of encontrados) console.error(`  ${r}`);
  process.exit(1);
}
console.log('Sin ejecutables en las dependencias.');
