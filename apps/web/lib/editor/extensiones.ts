import Highlight from '@tiptap/extension-highlight';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import Underline from '@tiptap/extension-underline';
import StarterKit from '@tiptap/starter-kit';

/**
 * Extensiones del texto con formato, compartidas por el editor y por quien lo muestra. Deben coincidir con la
 * lista blanca de @celmi/validation (contenidoEnriquecidoSchema): sin enlaces, encabezados, código ni imágenes.
 */

/** Subrayado con color opcional (p. ej. subrayar en verde). */
const SubrayadoConColor = Underline.extend({
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (el: HTMLElement) => el.style.textDecorationColor || null,
        renderHTML: (attrs: { color?: string | null }) =>
          attrs.color && /^#[0-9a-fA-F]{6}$/.test(attrs.color)
            ? {
                style: `text-decoration-color: ${attrs.color}; text-decoration-thickness: 2px; text-underline-offset: 3px`,
              }
            : {},
      },
    };
  },
});

export const EXTENSIONES = [
  StarterKit.configure({
    heading: false,
    code: false,
    codeBlock: false,
    blockquote: false,
    horizontalRule: false,
    link: false,
    underline: false,
    dropcursor: false,
  }),
  SubrayadoConColor,
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
];

/** Paleta de colores permitidos (mismos tonos en modo claro y oscuro). */
export const COLORES_TEXTO = [
  { nombre: 'Rojo', valor: '#DC2626' },
  { nombre: 'Naranja', valor: '#EA580C' },
  { nombre: 'Verde', valor: '#16A34A' },
  { nombre: 'Azul', valor: '#2563EB' },
  { nombre: 'Morado', valor: '#9333EA' },
  { nombre: 'Índigo', valor: '#4F46E5' },
];

export const COLORES_RESALTADO = [
  { nombre: 'Amarillo', valor: '#FEF08A' },
  { nombre: 'Verde', valor: '#BBF7D0' },
  { nombre: 'Azul', valor: '#BFDBFE' },
  { nombre: 'Rosa', valor: '#FBCFE8' },
  { nombre: 'Naranja', valor: '#FED7AA' },
];
