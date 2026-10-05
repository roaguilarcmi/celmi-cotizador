import { describe, expect, it } from 'vitest';
import { contenidoEnriquecidoSchema, leerContenido, textoPlano } from './enriquecido';

const doc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Llamar a ', marks: [{ type: 'bold' }] },
        { type: 'text', text: 'Héctor', marks: [{ type: 'textStyle', attrs: { color: '#DC2626' } }] },
      ],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Confirmar 2 equipos' }] }],
        },
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Vigencia',
                  marks: [{ type: 'underline', attrs: { color: '#16A34A' } }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe('texto con formato', () => {
  it('acepta negritas, colores, subrayado de color y viñetas', () => {
    expect(contenidoEnriquecidoSchema.safeParse(doc).success).toBe(true);
    expect(textoPlano(contenidoEnriquecidoSchema.parse(doc))).toBe(
      'Llamar a Héctor\n• Confirmar 2 equipos\n• Vigencia',
    );
  });

  it('rechaza enlaces, HTML incrustado, colores inválidos y nodos desconocidos', () => {
    const con = (marca: object) => ({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [marca] }] }],
    });
    expect(
      contenidoEnriquecidoSchema.safeParse(con({ type: 'link', attrs: { href: 'javascript:alert(1)' } }))
        .success,
    ).toBe(false);
    expect(
      contenidoEnriquecidoSchema.safeParse(
        con({ type: 'textStyle', attrs: { color: 'red;background:url(x)' } }),
      ).success,
    ).toBe(false);
    expect(
      contenidoEnriquecidoSchema.safeParse({
        type: 'doc',
        content: [{ type: 'image', attrs: { src: 'http://x' } }],
      }).success,
    ).toBe(false);
    expect(
      contenidoEnriquecidoSchema.safeParse({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', onclick: 'alert(1)' }] }],
      }).success,
    ).toBe(false);
  });

  it('normaliza lo pegado desde Word/Excel: colores rgb() y nodos no admitidos', () => {
    const pegado = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Título pegado' }] },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Rojo',
              marks: [{ type: 'textStyle', attrs: { color: 'rgb(220, 38, 38)' } }],
            },
            { type: 'text', text: ' enlace', marks: [{ type: 'link', attrs: { href: 'javascript:x' } }] },
          ],
        },
      ],
    };
    const r = leerContenido(JSON.stringify(pegado));
    expect(r.ok).toBe(true);
    const doc = (r as { doc: { content: { content: { marks?: { attrs?: { color: string } }[] }[] }[] } }).doc;
    expect(doc.content[1]!.content[0]!.marks![0]!.attrs!.color).toBe('#DC2626');
    expect(doc.content[1]!.content[1]!.marks).toBeUndefined();
    expect(textoPlano(doc as never)).toBe('Título pegado\nRojo enlace');
  });

  it('lee el campo del formulario: vacío o sólo espacios → sin contenido', () => {
    expect(leerContenido('')).toEqual({ ok: true, doc: null });
    expect(leerContenido(JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }))).toEqual({
      ok: true,
      doc: null,
    });
    expect(leerContenido('{no es json')).toMatchObject({ ok: false });
  });
});
