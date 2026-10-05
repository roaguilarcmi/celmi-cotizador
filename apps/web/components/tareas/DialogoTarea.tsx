'use client';

import { VentanaFlotante } from '@/components/VentanaFlotante';
import type { TareaFila } from '@/lib/datos';
import { FormularioTarea } from './FormularioTarea';
import { Subtareas } from './Subtareas';

/**
 * Detalle de una tarea en ventana flotante: editar o reprogramar, y sus subtareas. Si hay cambios sin guardar en la
 * tarea, pregunta antes de cerrar (las subtareas se guardan al momento).
 */
export function DialogoTarea({ tarea, onCerrar }: { tarea: TareaFila; onCerrar: () => void }) {
  return (
    <VentanaFlotante
      titulo="Detalle de la tarea"
      detalle={
        tarea.oportunidad &&
        [tarea.oportunidad.cliente?.razon_social, tarea.oportunidad.nombre].filter(Boolean).join(' · ')
      }
      esEdicion
      onCerrar={onCerrar}
    >
      <FormularioTarea tarea={tarea} onListo={onCerrar} />
      <Subtareas tarea={tarea} />
    </VentanaFlotante>
  );
}
