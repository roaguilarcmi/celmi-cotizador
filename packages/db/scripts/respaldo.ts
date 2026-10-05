// Respaldo cifrado de toda la base (el plan gratuito de Supabase no tiene respaldos automáticos).
// Uso: npm run respaldo -w @celmi/db
// Lee de packages/db/.env.local: SUPABASE_DB_URL y RESPALDO_CLAVE (mín. 16 caracteres; guárdala también fuera del
// equipo: sin ella el respaldo no se puede abrir). Opcional: RESPALDOS_DIR (por omisión, Documentos\Respaldos CELMI).
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import postgres from 'postgres';
import { cifrarRespaldo, LARGO_MINIMO_CLAVE, nombreDeRespaldo, type Respaldo } from '../src/respaldo.ts';

const CONSERVAR = 12;
const url = process.env.SUPABASE_DB_URL;
const clave = process.env.RESPALDO_CLAVE;
const carpeta = process.env.RESPALDOS_DIR || join(homedir(), 'Documents', 'Respaldos CELMI');

if (!url) {
  console.error('Falta SUPABASE_DB_URL en packages/db/.env.local.');
  process.exit(1);
}
if (!clave || clave.length < LARGO_MINIMO_CLAVE) {
  console.error(
    `Falta RESPALDO_CLAVE en packages/db/.env.local (al menos ${LARGO_MINIMO_CLAVE} caracteres).\n` +
      'Inventa una frase larga, agrégala como RESPALDO_CLAVE=... y guárdala también en un lugar seguro fuera del equipo.',
  );
  process.exit(1);
}

const sql = postgres(url, { ssl: 'require', max: 1, onnotice: () => {} });
try {
  // Todas las tablas de la aplicación (public) y el registro de migraciones (app). Los usuarios de Supabase Auth
  // (contraseñas, 2FA) no se respaldan aquí: se gestionan desde Supabase y no deben salir de ahí.
  const tablas = await sql<{ esquema: string; tabla: string }[]>`
    select table_schema as esquema, table_name as tabla
    from information_schema.tables
    where table_schema in ('public', 'app') and table_type = 'BASE TABLE'
    order by 1, 2`;
  const respaldo: Respaldo = { version: 1, creado_en: new Date().toISOString(), migracion: null, tablas: {} };
  let total = 0;
  // Una sola transacción de sólo lectura: todas las tablas en el mismo instante, sin escribir nada.
  await sql.begin('isolation level repeatable read read only', async (tx) => {
    for (const { esquema, tabla } of tablas) {
      // Nombres tomados del catálogo, citados como identificadores.
      const id = (n: string) => `"${n.replaceAll('"', '""')}"`;
      const filas = await tx.unsafe(`select * from ${id(esquema)}.${id(tabla)}`);
      respaldo.tablas[`${esquema}.${tabla}`] = [...filas];
      total += filas.length;
    }
    const [ultima] = await tx<
      { nombre: string }[]
    >`select nombre from app.migraciones order by nombre desc limit 1`;
    respaldo.migracion = ultima?.nombre ?? null;
  });

  mkdirSync(carpeta, { recursive: true });
  const archivo = join(carpeta, nombreDeRespaldo());
  writeFileSync(archivo, cifrarRespaldo(respaldo, clave));

  const viejos = readdirSync(carpeta)
    .filter((n) => /^celmi-\d{4}-\d{2}-\d{2}-\d{4}\.respaldo$/.test(n))
    .sort()
    .slice(0, -CONSERVAR);
  for (const n of viejos) rmSync(join(carpeta, n));

  console.log(`Respaldo cifrado: ${archivo}`);
  console.log(`${tablas.length} tablas, ${total} registros. Se conservan los ${CONSERVAR} más recientes.`);
} finally {
  await sql.end();
}
