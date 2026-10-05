// Ejecuta cada consulta de la aplicación contra la API real de Supabase (PostgREST) para detectar errores que las
// pruebas con PGlite no ven, como relaciones ambiguas (PGRST201). Sólo lee (limit 1) con la clave de servicio.
// Uso: npm run verificar:consultas -w @celmi/web
import { createClient } from '@supabase/supabase-js';
import { CONSULTAS, TABLA_DE_CONSULTA } from '../lib/consultas.ts';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const clave = process.env.SUPABASE_SECRET_KEY;
if (!url || !clave) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en apps/web/.env.local');
  process.exit(1);
}

const supabase = createClient(url, clave, { auth: { persistSession: false } });
let fallas = 0;
for (const [nombre, columnas] of Object.entries(CONSULTAS)) {
  const tabla = TABLA_DE_CONSULTA[nombre as keyof typeof CONSULTAS];
  const { error } = await supabase.from(tabla).select(columnas).limit(1);
  console.log(`${error ? '✘' : '✔'} ${nombre} (${tabla})${error ? ` · ${error.code} ${error.message}` : ''}`);
  if (error) fallas++;
}
// Relación de una tabla consigo misma: `subtareas` debe traer las hijas (lista), no la tarea principal (objeto).
{
  const { data, error } = await supabase
    .from('tareas')
    .select(CONSULTAS.tareas)
    .is('tarea_padre_id', null)
    .limit(1);
  const fila = (data as unknown as { subtareas: unknown }[] | null)?.[0];
  const bien = !error && (!fila || Array.isArray(fila.subtareas));
  console.log(
    `${bien ? '✔' : '✘'} tareas.subtareas llega como lista${fila ? '' : ' (sin tareas para revisar)'}`,
  );
  if (!bien) fallas++;
}
// Función de la API: etapas personales. Con la clave de servicio no hay sesión ni acceso al esquema interno `app`
// (42501): eso prueba que la API la encontró y la ejecutó. Lo que se busca detectar es que no exista (PGRST202).
{
  const { error } = await supabase.rpc('mis_etapas_tarea').select(CONSULTAS.etapas);
  const bien = !error || error.code === '42501';
  console.log(`${bien ? '✔' : '✘'} mis_etapas_tarea()${bien ? '' : ` · ${error?.code} ${error?.message}`}`);
  if (!bien) fallas++;
}
console.log(fallas ? `\n${fallas} consulta(s) con error.` : '\nTodas las consultas responden.');
process.exit(fallas ? 1 : 0);
