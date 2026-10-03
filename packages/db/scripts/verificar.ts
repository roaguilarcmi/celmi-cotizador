// Verifica en la base real (Supabase) las mismas garantías que prueban los tests con PGlite.
// No modifica nada: todo corre dentro de transacciones que se revierten.
// Uso: npm run verificar -w @celmi/db
import postgres from 'postgres';

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('Falta SUPABASE_DB_URL en packages/db/.env.local');
  process.exit(1);
}

const sql = postgres(url, { ssl: 'require', max: 1, onnotice: () => {} });
let fallas = 0;
const revisar = (ok: boolean, texto: string) => {
  console.log(`${ok ? '✔' : '✘'} ${texto}`);
  if (!ok) fallas++;
};

/** Ejecuta `fn` como lo haría la API de Supabase para un usuario, y revierte. */
async function como<T>(
  rol: 'anon' | 'authenticated',
  claims: object,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
) {
  let resultado: T | undefined;
  let error: unknown;
  await sql
    .begin(async (tx) => {
      await tx.unsafe(`set local role ${rol}`);
      await tx`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
      try {
        resultado = await fn(tx);
      } catch (e) {
        error = e;
      }
      throw new Error('revertir');
    })
    .catch(() => undefined);
  if (error) throw error;
  return resultado as T;
}

try {
  const migraciones = await sql<{ nombre: string }[]>`select nombre from app.migraciones order by nombre`;
  revisar(migraciones.length >= 5, `Migraciones registradas: ${migraciones.map((m) => m.nombre).join(', ')}`);

  const sinRls = await sql<{ tablename: string }[]>`
    select tablename from pg_tables where schemaname = 'public' and not rowsecurity`;
  revisar(
    sinRls.length === 0,
    `Todas las tablas públicas tienen RLS${sinRls.length ? ` (faltan: ${sinRls.map((t) => t.tablename).join(', ')})` : ''}`,
  );

  const [admin] = await sql<{ id: string; nombre: string }[]>`
    select id, nombre from public.perfiles where rol_id = 'administrador' and activo order by creado_en limit 1`;
  revisar(Boolean(admin), admin ? `Administrador activo: ${admin.nombre}` : 'No hay administrador activo');

  const anon = await como('anon', {}, (tx) => tx`select count(*)::int as n from public.monedas`).catch(
    (e: { code?: string }) => e.code,
  );
  revisar(anon === '42501', 'Sin sesión (anon) se rechaza el acceso a las tablas');

  if (admin) {
    const sin2fa = await como(
      'authenticated',
      { sub: admin.id, aal: 'aal1' },
      (tx) => tx<{ n: number }[]>`select count(*)::int as n from public.monedas`,
    );
    revisar(sin2fa[0]?.n === 0, 'Sin segundo factor (aal1) no se ve ningún dato');

    const con2fa = await como(
      'authenticated',
      { sub: admin.id, aal: 'aal2' },
      (tx) => tx<{ p: string[] }[]>`select public.mis_permisos() as p`,
    );
    revisar(
      (con2fa[0]?.p ?? []).includes('usuarios.administrar'),
      'Con 2FA (aal2) el administrador tiene sus permisos',
    );

    const auditoria = await como(
      'authenticated',
      { sub: admin.id, aal: 'aal2' },
      (tx) => tx`delete from public.auditoria`,
    ).catch((e: { code?: string }) => e.code);
    revisar(auditoria === '42501', 'La auditoría no se puede borrar');
  }
} finally {
  await sql.end();
}

console.log(fallas ? `\n${fallas} verificación(es) fallaron.` : '\nTodo en orden.');
process.exit(fallas ? 1 : 0);
