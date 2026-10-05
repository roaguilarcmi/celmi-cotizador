'use client';

import { VentanaFlotante } from '@/components/VentanaFlotante';
import type { TareaFila } from '@/lib/datos';
import { FormularioTarea } from './FormularioTarea';

/** Editar o reprogramar una tarea en ventana flotante; si hay cambios sin guardar, pregunta antes de cerrar. */
export function DialogoTarea({ tarea, onCerrar }: { tarea: TareaFila; onCerrar: () => void }) {
  return (
    <VentanaFlotante
      titulo="Editar o reprogramar tarea"
      detalle={
        tarea.oportunidad &&
        [tarea.oportunidad.cliente?.razon_social, tarea.oportunidad.nombre].filter(Boolean).join(' · ')
      }
      esEdicion
      onCerrar={onCerrar}
    >
      <FormularioTarea tarea={tarea} onListo={onCerrar} />
    </VentanaFlotante>
  );
}
