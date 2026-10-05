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
console.log(fallas ? `\n${fallas} consulta(s) con error.` : '\nTodas las consultas responden.');
process.exit(fallas ? 1 : 0);
