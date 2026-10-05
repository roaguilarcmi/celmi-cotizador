import { contenidoEnriquecidoSchema, normalizarContenido } from '@celmi/validation';
import { renderToReactElement } from '@tiptap/static-renderer/pm/react';
import { EXTENSIONES } from '@/lib/editor/extensiones';

/**
 * Muestra texto con formato guardado. Se vuelve a validar contra la lista blanca y se convierte en elementos
 * de React (nunca se inserta HTML), así que una nota no puede ejecutar código. Si algo no es válido, muestra el
 * texto simple.
 */
export function TextoEnriquecido({ contenido, respaldo }: { contenido: unknown; respaldo: string }) {
  const r = contenidoEnriquecidoSchema.safeParse(normalizarContenido(contenido));
  if (!r.success) return <p className="text-sm leading-relaxed whitespace-pre-line">{respaldo}</p>;
  return (
    <div className="texto-enriquecido text-sm leading-relaxed">
      {renderToReactElement({ content: r.data, extensions: EXTENSIONES })}
    </div>
  );
}
