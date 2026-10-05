'use client';

import { useEffect, useRef } from 'react';
import { Icon } from '@/components/Icon';
import type { TareaFila } from '@/lib/datos';
import { FormularioTarea } from './FormularioTarea';

/** Ventana para editar o reprogramar una tarea (diálogo nativo: accesible y cierra con Esc). */
export function DialogoTarea({ tarea, onCerrar }: { tarea: TareaFila; onCerrar: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onCerrar}
      onClick={(e) => {
        if (e.target === ref.current) onCerrar();
      }}
      aria-labelledby={`dialogo-${tarea.id}`}
      className="m-auto w-[min(640px,calc(100vw-2rem))] rounded-lg border border-borde bg-superficie p-0 text-texto sombra backdrop:bg-[#0F0E1F]/50 backdrop:backdrop-blur-[2px]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-borde px-6 py-4">
        <h2 id={`dialogo-${tarea.id}`} className="text-[17px] font-bold tracking-tight">
          Editar o reprogramar tarea
        </h2>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="inline-flex size-9 cursor-pointer items-center justify-center rounded-md text-texto-suave hover:bg-superficie-2"
        >
          <Icon name="cerrar" size={18} />
        </button>
      </div>
      <div className="max-h-[75vh] overflow-y-auto px-6 py-5">
        {tarea.oportunidad && (
          <p className="mb-4 text-[13px] text-texto-suave">
            {tarea.oportunidad.cliente?.razon_social} · {tarea.oportunidad.nombre}
          </p>
        )}
        <FormularioTarea tarea={tarea} onListo={onCerrar} />
      </div>
    </dialog>
  );
}
