// Vincula una cuenta ya creada en Supabase Auth como administrador (sólo para el arranque; después las altas
// se hacen desde la aplicación). Uso:
//   npm run primer-admin -w @celmi/db -- correo@celmi.com.mx "Nombre completo" "Puesto"
import postgres from 'postgres';

const [correo, nombre, puesto = ''] = process.argv.slice(2);
if (!correo || !nombre) {
  console.error('Uso: npm run primer-admin -w @celmi/db -- correo "Nombre completo" "Puesto"');
  process.exit(1);
}
const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('Falta SUPABASE_DB_URL en packages/db/.env.local');
  process.exit(1);
}

const sql = postgres(url, { ssl: 'require', max: 1, onnotice: () => {} });
try {
  const [usuario] = await sql<
    { id: string }[]
  >`select id from auth.users where lower(email) = lower(${correo})`;
  if (!usuario)
    throw new Error(`No existe la cuenta ${correo} en Supabase Auth (créala en Authentication → Users).`);
  await sql`
    insert into public.perfiles (id, nombre, correo, puesto, rol_id)
    values (${usuario.id}, ${nombre}, ${correo.toLowerCase()}, ${puesto}, 'administrador')
    on conflict (id) do update set rol_id = 'administrador', activo = true, nombre = excluded.nombre,
      puesto = excluded.puesto`;
  console.log(`${nombre} (${correo}) quedó como administrador activo.`);
} finally {
  await sql.end();
}
