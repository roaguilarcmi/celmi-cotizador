import { z } from 'zod';

/**
 * Texto con formato (documento de Tiptap/ProseMirror en JSON). Se guarda como estructura validada —nunca como
 * HTML— y se muestra sin insertar HTML, así que no puede colarse código. Sólo se aceptan los nodos y marcas
 * de la lista blanca, y los colores en formato #RRGGBB.
 */

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color no válido');
const colorOpcional = color.nullable().optional();

const marca = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bold') }),
  z.object({ type: z.literal('italic') }),
  z.object({ type: z.literal('strike') }),
  z.object({ type: z.literal('underline'), attrs: z.object({ color: colorOpcional }).strict().optional() }),
  z.object({
    type: z.literal('textStyle'),
    attrs: z.object({ color: colorOpcional }).catchall(z.null()).optional(),
  }),
  z.object({ type: z.literal('highlight'), attrs: z.object({ color: colorOpcional }).strict().optional() }),
]);

const texto = z
  .object({
    type: z.literal('text'),
    text: z.string().min(1).max(5000),
    marks: z.array(marca).max(8).optional(),
  })
  .strict();

const saltoDeLinea = z
  .object({ type: z.literal('hardBreak'), marks: z.array(marca).max(8).optional() })
  .strict();

const parrafo = z
  .object({
    type: z.literal('paragraph'),
    content: z
      .array(z.union([texto, saltoDeLinea]))
      .max(500)
      .optional(),
  })
  .strict();

type Bloque =
  | z.infer<typeof parrafo>
  | { type: 'bulletList' | 'orderedList'; attrs?: { start?: number; type?: string | null }; content: Item[] };
type Item = { type: 'listItem'; content: Bloque[] };

const bloque: z.ZodType<Bloque> = z.lazy(() => z.union([parrafo, lista]));
const item: z.ZodType<Item> = z.lazy(() =>
  z.object({ type: z.literal('listItem'), content: z.array(bloque).min(1).max(50) }).strict(),
);
const lista = z
  .object({
    type: z.enum(['bulletList', 'orderedList']),
    attrs: z
      .object({ start: z.number().int().min(1).max(9999).optional(), type: z.string().nullable().optional() })
      .optional(),
    content: z.array(item).min(1).max(200),
  })
  .strict();

/** Documento completo; además se limita su tamaño total. */
export const contenidoEnriquecidoSchema = z
  .object({ type: z.literal('doc'), content: z.array(bloque).max(300) })
  .strict()
  .refine((d) => JSON.stringify(d).length <= 60_000, 'El texto es demasiado largo');

export type ContenidoEnriquecido = z.infer<typeof contenidoEnriquecidoSchema>;

/** Versión en texto simple (para búsquedas, avisos y la bitácora sin formato). */
export function textoPlano(doc: ContenidoEnriquecido): string {
  const partes: string[] = [];
  const recorrer = (nodos: unknown[], prefijo = '') => {
    for (const n of nodos as { type: string; text?: string; content?: unknown[] }[]) {
      if (n.type === 'paragraph') {
        partes.push(
          prefijo +
            (n.content ?? [])
              .map((t) =>
                (t as { type: string; text?: string }).type === 'hardBreak'
                  ? '\n'
                  : ((t as { text?: string }).text ?? ''),
              )
              .join(''),
        );
      } else if (n.type === 'bulletList' || n.type === 'orderedList') {
        (n.content ?? []).forEach((li, i) =>
          recorrer((li as { content: unknown[] }).content, n.type === 'bulletList' ? '• ' : `${i + 1}. `),
        );
      }
    }
  };
  recorrer(doc.content);
  return partes.join('\n').trim();
}

const MARCAS = new Set(['bold', 'italic', 'strike', 'underline', 'textStyle', 'highlight']);
const BLOQUES = new Set(['paragraph', 'bulletList', 'orderedList', 'listItem']);

/** rgb(220, 38, 38) / #dc2626 → #DC2626; cualquier otra cosa → null. */
function aHex(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const v = valor.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toUpperCase();
  const m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i.exec(v);
  if (!m) return null;
  return `#${[m[1], m[2], m[3]]
    .map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

/**
 * Deja el documento dentro de la lista blanca: convierte colores a #RRGGBB y descarta marcas o nodos no admitidos
 * (p. ej. lo que llega al pegar desde Word o Excel). Después se valida con `contenidoEnriquecidoSchema`.
 */
export function normalizarContenido(nodo: unknown): unknown {
  if (!nodo || typeof nodo !== 'object') return nodo;
  const n = nodo as {
    type?: string;
    text?: string;
    marks?: unknown[];
    content?: unknown[];
    attrs?: Record<string, unknown>;
  };
  if (n.type === 'text') {
    const marks = (n.marks ?? [])
      .map((m) => m as { type: string; attrs?: Record<string, unknown> })
      .filter((m) => MARCAS.has(m.type))
      .map((m) =>
        ['underline', 'textStyle', 'highlight'].includes(m.type)
          ? { type: m.type, attrs: { color: aHex(m.attrs?.color) } }
          : { type: m.type },
      );
    return { type: 'text', text: n.text ?? '', ...(marks.length ? { marks } : {}) };
  }
  if (n.type === 'hardBreak') return { type: 'hardBreak' };
  const content = (n.content ?? []).map(normalizarContenido).filter((x) => {
    const t = (x as { type?: string } | null)?.type;
    return t === 'text'
      ? Boolean((x as { text?: string }).text)
      : t === 'hardBreak' || (t !== undefined && BLOQUES.has(t));
  });
  if (n.type === 'doc') return { type: 'doc', content };
  if (n.type === 'orderedList')
    return { type: 'orderedList', attrs: { start: Number(n.attrs?.start) || 1, type: null }, content };
  if (n.type && BLOQUES.has(n.type))
    return { type: n.type, ...(content.length || n.type === 'listItem' ? { content } : {}) };
  // Nodo no admitido (encabezado, cita…): se conserva su texto como párrafo.
  const textos = content.filter(
    (x) => (x as { type?: string }).type === 'text' || (x as { type?: string }).type === 'hardBreak',
  );
  return { type: 'paragraph', ...(textos.length ? { content: textos } : {}) };
}

/** Lee el campo de formulario con el documento serializado; vacío → null. */
export function leerContenido(
  valor: unknown,
): { ok: true; doc: ContenidoEnriquecido | null } | { ok: false; error: string } {
  if (typeof valor !== 'string' || valor.trim() === '') return { ok: true, doc: null };
  let crudo: unknown;
  try {
    crudo = JSON.parse(valor);
  } catch {
    return { ok: false, error: 'El texto con formato no es válido.' };
  }
  const r = contenidoEnriquecidoSchema.safeParse(normalizarContenido(crudo));
  if (!r.success)
    return { ok: false, error: r.error.issues[0]?.message ?? 'El texto con formato no es válido.' };
  return { ok: true, doc: textoPlano(r.data) ? r.data : null };
}
