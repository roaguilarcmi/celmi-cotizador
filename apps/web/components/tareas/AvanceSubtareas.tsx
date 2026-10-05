import { Icon } from '@/components/Icon';
import type { TareaFila } from '@/lib/datos';

/** Subtareas vigentes (las canceladas no cuentan ni se muestran). */
export const subtareasVigentes = (t: Pick<TareaFila, 'subtareas'>) =>
  (t.subtareas ?? []).filter((s) => s.estado !== 'cancelada');

/** «2/5» con barra de avance; se usa en tarjetas y filas. */
export function AvanceSubtareas({ tarea }: { tarea: Pick<TareaFila, 'subtareas'> }) {
  const vigentes = subtareasVigentes(tarea);
  if (vigentes.length === 0) return null;
  const hechas = vigentes.filter((s) => s.estado === 'completada').length;
  const completas = hechas === vigentes.length;
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold ${completas ? 'text-exito' : ''}`}
      title={`${hechas} de ${vigentes.length} subtareas completadas`}
    >
      <Icon name="palomita" size={13} strokeWidth={2.4} />
      <span className="tabular">
        {hechas}/{vigentes.length}
      </span>
      <span aria-hidden="true" className="h-1 w-8 overflow-hidden rounded-pill bg-borde">
        <span
          className="block h-full rounded-pill bg-exito"
          style={{ width: `${(hechas / vigentes.length) * 100}%` }}
        />
      </span>
    </span>
  );
}
