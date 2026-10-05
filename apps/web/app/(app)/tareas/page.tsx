import { BotonActivarAvisos } from '@/components/tareas/BotonActivarAvisos';
import { ListaTareas } from '@/components/tareas/ListaTareas';
import { EnConstruccion } from '@/components/EnConstruccion';
import { Tarjeta, Titulo2 } from '@/components/ui';
import { listarMisTareas, type TareaFila } from '@/lib/datos';
import { obtenerSesion } from '@/lib/sesion';

export const metadata = { title: 'Mis tareas' };
export const dynamic = 'force-dynamic';

function agrupar(tareas: TareaFila[]) {
  const ahora = Date.now();
  const finDeHoy = new Date();
  finDeHoy.setHours(23, 59, 59, 999);
  const enSiete = ahora + 7 * 86_400_000;
  const pendientes = tareas.filter((t) => t.estado === 'pendiente');
  const vence = (t: TareaFila) => new Date(t.vence_en).getTime();
  return [
    { titulo: 'Vencidas', tareas: pendientes.filter((t) => vence(t) < ahora) },
    { titulo: 'Hoy', tareas: pendientes.filter((t) => vence(t) >= ahora && vence(t) <= finDeHoy.getTime()) },
    {
      titulo: 'Próximos 7 días',
      tareas: pendientes.filter((t) => vence(t) > finDeHoy.getTime() && vence(t) <= enSiete),
    },
    { titulo: 'Más adelante', tareas: pendientes.filter((t) => vence(t) > enSiete) },
  ];
}

export default async function MisTareas() {
  const sesion = await obtenerSesion();
  if (sesion.demo) return <EnConstruccion slug="tareas" />;
  const tareas = await listarMisTareas();
  const grupos = agrupar(tareas);
  const cerradas = tareas.filter((t) => t.estado !== 'pendiente').slice(-30);
  const totalPendientes = grupos.reduce((s, g) => s + g.tareas.length, 0);

  return (
    <div className="animar-entrada mx-auto max-w-[900px]">
      <header className="mb-6 flex flex-wrap items-end gap-4">
        <div className="mr-auto">
          <h1 className="text-[28px] leading-tight font-bold tracking-tight">Mis tareas</h1>
          <p className="mt-1.5 text-sm text-texto-suave">
            Son personales: sólo tú las ves. Se crean desde la ficha de cada oportunidad.
          </p>
        </div>
        <BotonActivarAvisos />
      </header>

      {totalPendientes === 0 && (
        <Tarjeta className="mb-4 px-6 py-10 text-center text-sm text-texto-suave">
          No tienes tareas pendientes. Prográmalas desde la ficha de una oportunidad, en «Mis tareas».
        </Tarjeta>
      )}

      <div className="flex flex-col gap-4">
        {grupos
          .filter((g) => g.tareas.length > 0)
          .map((g) => (
            <Tarjeta key={g.titulo} className="px-5 pt-4 pb-2">
              <div className="flex items-baseline justify-between">
                <Titulo2>{g.titulo}</Titulo2>
                <span
                  className={`tabular text-[13px] font-semibold ${g.titulo === 'Vencidas' ? 'text-peligro' : 'text-texto-suave'}`}
                >
                  {g.tareas.length}
                </span>
              </div>
              <ListaTareas tareas={g.tareas} mostrarOportunidad />
            </Tarjeta>
          ))}
        {cerradas.length > 0 && (
          <Tarjeta className="px-5 pt-4 pb-2">
            <Titulo2>Completadas y canceladas recientes</Titulo2>
            <ListaTareas tareas={cerradas} mostrarOportunidad vacio="" />
          </Tarjeta>
        )}
      </div>
    </div>
  );
}
