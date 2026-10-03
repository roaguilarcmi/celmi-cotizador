// Aplica las migraciones pendientes a la base de Supabase.
// Uso: npm run migrar -w @celmi/db   (lee SUPABASE_DB_URL de packages/db/.env.local, que no se versiona)
import postgres from 'postgres';
import { aplicarMigraciones } from '../src/migraciones.ts';

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error(
    'Falta SUPABASE_DB_URL en packages/db/.env.local (cadena de conexión del panel de Supabase).',
  );
  process.exit(1);
}

const sql = postgres(url, { ssl: 'require', max: 1, onnotice: () => {} });
try {
  const nuevas = await aplicarMigraciones({
    ejecutar: async (texto) => {
      await sql.unsafe(texto).simple();
    },
    consultar: async <T>(texto: string) => (await sql.unsafe(texto)) as unknown as T[],
  });
  console.log(nuevas.length ? `Migraciones aplicadas:\n  ${nuevas.join('\n  ')}` : 'La base ya está al día.');
} finally {
  await sql.end();
}
