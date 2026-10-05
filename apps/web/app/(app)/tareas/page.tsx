import { EnConstruccion } from '@/components/EnConstruccion';
import { TableroTareas } from '@/components/tareas/TableroTareas';
import { listarMisTareas } from '@/lib/datos';
import { obtenerSesion } from '@/lib/sesion';

export const metadata = { title: 'Mis tareas' };
export const dynamic = 'force-dynamic';

export default async function MisTareas() {
  const sesion = await obtenerSesion();
  if (sesion.demo) return <EnConstruccion slug="tareas" />;
  const tareas = await listarMisTareas();
  return <TableroTareas tareas={tareas} />;
}
