'use client';

import type { JSONContent } from '@tiptap/core';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { useState } from 'react';
import { COLORES_RESALTADO, COLORES_TEXTO, EXTENSIONES } from '@/lib/editor/extensiones';

type Paleta = 'texto' | 'resaltado' | 'subrayado' | null;

/**
 * Cuadro de texto con formato: negritas, cursivas, subrayado (también de color), tachado, viñetas, numeración,
 * color de texto y resaltado. El documento viaja en el campo oculto `nombre` como JSON (lo valida el servidor).
 */
export function EditorEnriquecido({
  nombre,
  inicial,
  placeholder,
  etiqueta,
  minAlto = 96,
}: {
  nombre: string;
  inicial?: JSONContent | null;
  placeholder: string;
  etiqueta: string;
  minAlto?: number;
}) {
  const [json, setJson] = useState(() => (inicial ? JSON.stringify(inicial) : ''));
  const [paleta, setPaleta] = useState<Paleta>(null);

  const editor = useEditor({
    extensions: [...EXTENSIONES, Placeholder.configure({ placeholder })],
    content: inicial ?? '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        'aria-label': etiqueta,
        'aria-multiline': 'true',
        role: 'textbox',
        class:
          'texto-enriquecido min-h-[inherit] px-3.5 py-3 text-sm leading-relaxed text-texto outline-none',
      },
    },
    onUpdate: ({ editor: e }) => setJson(e.isEmpty ? '' : JSON.stringify(e.getJSON())),
  });

  const estado = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive('bold'),
            italic: e.isActive('italic'),
            underline: e.isActive('underline'),
            strike: e.isActive('strike'),
            bulletList: e.isActive('bulletList'),
            orderedList: e.isActive('orderedList'),
          }
        : null,
  });

  const cadena = () => editor?.chain().focus();
  const boton = (
    activo: boolean | undefined,
    etiquetaBoton: string,
    accion: () => void,
    contenido: React.ReactNode,
  ) => (
    <button
      type="button"
      aria-label={etiquetaBoton}
      title={etiquetaBoton}
      aria-pressed={Boolean(activo)}
      onMouseDown={(e) => e.preventDefault()}
      onClick={accion}
      className={`inline-flex size-8 cursor-pointer items-center justify-center rounded-sm text-[13px] transition-colors ${
        activo ? 'bg-paso text-white' : 'text-texto hover:bg-superficie-2'
      }`}
    >
      {contenido}
    </button>
  );

  const aplicarColor = (valor: string | null) => {
    const c = cadena();
    if (!c) return;
    if (paleta === 'texto') (valor ? c.setColor(valor) : c.unsetColor()).run();
    if (paleta === 'resaltado') (valor ? c.setHighlight({ color: valor }) : c.unsetHighlight()).run();
    if (paleta === 'subrayado') (valor ? c.setMark('underline', { color: valor }) : c.unsetUnderline()).run();
    setPaleta(null);
  };

  const colores = paleta === 'resaltado' ? COLORES_RESALTADO : COLORES_TEXTO;

  return (
    <div
      data-editor-marco
      className="rounded-md border-2 border-texto/20 bg-superficie transition-colors focus-within:border-acento focus-within:ring-4 focus-within:ring-acento-suave"
    >
      <div
        role="toolbar"
        aria-label={`Formato de ${etiqueta.toLowerCase()}`}
        className="flex flex-wrap items-center gap-0.5 border-b border-borde px-1.5 py-1"
      >
        {boton(estado?.bold, 'Negritas', () => cadena()?.toggleBold().run(), <strong>B</strong>)}
        {boton(
          estado?.italic,
          'Cursivas',
          () => cadena()?.toggleItalic().run(),
          <em className="font-serif">I</em>,
        )}
        {boton(
          estado?.underline,
          'Subrayado',
          () => cadena()?.toggleUnderline().run(),
          <span className="underline">U</span>,
        )}
        {boton(
          estado?.strike,
          'Tachado',
          () => cadena()?.toggleStrike().run(),
          <span className="line-through">S</span>,
        )}
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-borde" />
        {boton(
          estado?.bulletList,
          'Viñetas',
          () => cadena()?.toggleBulletList().run(),
          <span aria-hidden="true">•≡</span>,
        )}
        {boton(
          estado?.orderedList,
          'Numeración',
          () => cadena()?.toggleOrderedList().run(),
          <span aria-hidden="true" className="text-[11px] font-bold">
            1.
          </span>,
        )}
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-borde" />
        {boton(
          paleta === 'texto',
          'Color de texto',
          () => setPaleta((p) => (p === 'texto' ? null : 'texto')),
          <span className="font-bold underline decoration-[#DC2626] decoration-[3px]">A</span>,
        )}
        {boton(
          paleta === 'resaltado',
          'Resaltado',
          () => setPaleta((p) => (p === 'resaltado' ? null : 'resaltado')),
          <span className="rounded-[3px] bg-[#FEF08A] px-1 font-bold text-[#16133A]">A</span>,
        )}
        {boton(
          paleta === 'subrayado',
          'Color de subrayado',
          () => setPaleta((p) => (p === 'subrayado' ? null : 'subrayado')),
          <span className="font-bold underline decoration-[#16A34A] decoration-[3px] underline-offset-2">
            U
          </span>,
        )}
      </div>
      {paleta && (
        <div
          role="group"
          aria-label="Colores"
          className="flex flex-wrap items-center gap-1.5 border-b border-borde px-2.5 py-2"
        >
          <span className="mr-1 text-xs font-semibold text-texto-suave">
            {paleta === 'texto'
              ? 'Color de texto'
              : paleta === 'resaltado'
                ? 'Resaltado'
                : 'Color de subrayado'}
            :
          </span>
          {colores.map((c) => (
            <button
              key={c.valor}
              type="button"
              aria-label={c.nombre}
              title={c.nombre}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => aplicarColor(c.valor)}
              className="size-7 cursor-pointer rounded-full border-2 border-superficie shadow-[0_0_0_1px_var(--c-borde)] transition-transform hover:scale-110"
              style={{ background: c.valor }}
            />
          ))}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => aplicarColor(null)}
            className="ml-1 min-h-7 cursor-pointer rounded-sm px-2 text-xs font-semibold text-texto-suave hover:bg-superficie-2"
          >
            Quitar
          </button>
        </div>
      )}
      <div style={{ minHeight: minAlto }}>
        <EditorContent editor={editor} />
      </div>
      <input type="hidden" name={nombre} value={json} />
    </div>
  );
}
