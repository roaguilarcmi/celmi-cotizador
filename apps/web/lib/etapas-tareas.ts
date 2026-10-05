/** Etapas de trabajo de una tarea (decisión 2026-10-05): el tablero de «Mis tareas» es este pipeline. */
export type EstadoTarea = 'pendiente' | 'en_curso' | 'en_espera' | 'completada' | 'cancelada';

export const ETAPAS: {
  id: Exclude<EstadoTarea, 'cancelada'>;
  nombre: string;
  /** Color del título de la columna y del punto de la etapa. */
  texto: string;
  punto: string;
  fondo: string;
}[] = [
  { id: 'pendiente', nombre: 'Por hacer', texto: 'text-texto', punto: 'bg-neutro', fondo: 'bg-superficie-2' },
  {
    id: 'en_curso',
    nombre: 'En curso',
    texto: 'text-acento-texto',
    punto: 'bg-acento',
    fondo: 'bg-acento-suave/50',
  },
  {
    id: 'en_espera',
    nombre: 'En espera',
    texto: 'text-aviso',
    punto: 'bg-aviso',
    fondo: 'bg-aviso-suave/50',
  },
  {
    id: 'completada',
    nombre: 'Completada',
    texto: 'text-exito',
    punto: 'bg-exito',
    fondo: 'bg-exito-suave/50',
  },
];

/** Etapas en las que la tarea sigue abierta (cuentan como pendientes y disparan avisos). */
export const ESTADOS_ABIERTOS: EstadoTarea[] = ['pendiente', 'en_curso', 'en_espera'];
export const estaAbierta = (estado: EstadoTarea) => ESTADOS_ABIERTOS.includes(estado);

export const nombreEtapa = (estado: EstadoTarea) =>
  estado === 'cancelada' ? 'Cancelada' : (ETAPAS.find((e) => e.id === estado)?.nombre ?? estado);
