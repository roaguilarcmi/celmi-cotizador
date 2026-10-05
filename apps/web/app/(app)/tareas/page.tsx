import { EnConstruccion } from '@/components/EnConstruccion';
import { TableroTareas } from '@/components/tareas/TableroTareas';
import { listarBorradores, listarMisTareas, listarOportunidadesParaTareas } from '@/lib/datos';
import { obtenerSesion } from '@/lib/sesion';

export const metadata = { title: 'Mis tareas' };
export const dynamic = 'force-dynamic';

export default async function MisTareas() {
  const sesion = await obtenerSesion();
  if (sesion.demo) return <EnConstruccion slug="tareas" />;
  const [tareas, oportunidades, borradores] = await Promise.all([
    listarMisTareas(),
    listarOportunidadesParaTareas(),
    // Borrador de «Nueva tarea» creado desde aquí (sin oportunidad de origen).
    listarBorradores(null),
  ]);
  return <TableroTareas tareas={tareas} oportunidades={oportunidades} borrador={borradores.tarea} />;
}
