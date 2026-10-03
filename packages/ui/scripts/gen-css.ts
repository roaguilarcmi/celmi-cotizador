import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generarCSS } from '../src/css.ts';

const destino = fileURLToPath(new URL('../src/theme.css', import.meta.url));
writeFileSync(destino, generarCSS());
console.log(`theme.css actualizado: ${destino}`);
