import type { JSONContent } from '@tiptap/core';

/** Texto simple como documento para abrirlo en el editor con formato (una línea = un párrafo). */
export const textoComoDocumento = (texto: string): JSONContent => ({
  type: 'doc',
  content: texto
    .split('\n')
    .map((l) => (l ? { type: 'paragraph', content: [{ type: 'text', text: l }] } : { type: 'paragraph' })),
});
