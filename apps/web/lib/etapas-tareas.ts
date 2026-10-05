/**
 * Etapas de trabajo de las tareas (decisiones 2026-10-05): cada persona arma su propio pipeline. `estado` sigue siendo
 * el ciclo de vida (abierta, completada, cancelada) y la base lo mantiene de acuerdo con la etapa.
 */
export type EstadoTarea = 'pendiente' | 'en_curso' | 'en_espera' | 'completada' | 'cancelada';

export type ColorEtapa = 'neutro' | 'acento' | 'aviso' | 'exito' | 'peligro' | 'info';

export interface EtapaTarea {
  id: string;
  nombre: string;
  color: ColorEtapa;
  orden: number;
  /** La etapa final cierra la tarea (sólo hay una; se renombra, no se quita). */
  es_final: boolean;
}

/** Clases por color (sólo tokens del sistema de diseño). */
export const COLORES_ETAPA: Record<
  ColorEtapa,
  { nombre: string; texto: string; punto: string; fondo: string }
> = {
  neutro: { nombre: 'Gris', texto: 'text-texto', punto: 'bg-neutro', fondo: 'bg-superficie-2' },
  acento: { nombre: 'Azul', texto: 'text-acento-texto', punto: 'bg-acento', fondo: 'bg-acento-suave/50' },
  info: { nombre: 'Celeste', texto: 'text-info', punto: 'bg-info', fondo: 'bg-info-suave/60' },
  aviso: { nombre: 'Ámbar', texto: 'text-aviso', punto: 'bg-aviso', fondo: 'bg-aviso-suave/50' },
  exito: { nombre: 'Verde', texto: 'text-exito', punto: 'bg-exito', fondo: 'bg-exito-suave/50' },
  peligro: { nombre: 'Rojo', texto: 'text-peligro', punto: 'bg-peligro', fondo: 'bg-peligro-suave/50' },
};

export const MAX_ETAPAS = 8;

/** Estados en los que la tarea sigue abierta (cuentan como pendientes y disparan avisos). */
export const ESTADOS_ABIERTOS: EstadoTarea[] = ['pendiente', 'en_curso', 'en_espera'];
export const estaAbierta = (estado: EstadoTarea) => ESTADOS_ABIERTOS.includes(estado);

export const etapaInicial = (etapas: EtapaTarea[]) => etapas.find((e) => !e.es_final);
export const etapaFinal = (etapas: EtapaTarea[]) => etapas.find((e) => e.es_final);

/** Etapa en la que se muestra una tarea (las antiguas sin etapa caen en la inicial o en la final). */
export const etapaDe = (t: { etapa_id: string | null; estado: EstadoTarea }, etapas: EtapaTarea[]) =>
  etapas.find((e) => e.id === t.etapa_id) ??
  (t.estado === 'completada' ? etapaFinal(etapas) : etapaInicial(etapas));
