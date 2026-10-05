/**
 * Formato de lo copiado desde Excel (decisión 2026-10-05: al pegar se conservan negritas, cursivas, etc.).
 *
 * Además del texto con tabuladores, Excel pone en el portapapeles una tabla HTML: el formato de la celda va en clases
 * definidas en su <style> («.xl65 { font-weight:700 }») o en atributos, y el de partes de una celda en
 * <font class="font5"> o <span style>. Aquí se convierte a un documento con las marcas de nuestra lista blanca
 * (negrita, cursiva, subrayado, tachado y color); el servidor lo vuelve a validar al guardar. Sólo navegador (DOMParser).
 */
import type { ContenidoEnriquecido } from '@celmi/validation';

type Estilo = {
  negrita?: boolean;
  cursiva?: boolean;
  subrayado?: boolean;
  tachado?: boolean;
  color?: string;
};
type Marca =
  { type: 'bold' | 'italic' | 'underline' | 'strike' } | { type: 'textStyle'; attrs: { color: string } };
type Nodo = { type: 'text'; text: string; marks?: Marca[] } | { type: 'hardBreak' };

export interface CeldaHtml {
  texto: string;
  /** null si la celda no trae formato (texto simple). */
  contenido: ContenidoEnriquecido | null;
}

const NOMBRES: Record<string, string> = {
  red: '#ff0000',
  blue: '#0000ff',
  green: '#008000',
  navy: '#000080',
  purple: '#800080',
  maroon: '#800000',
  olive: '#808000',
  teal: '#008080',
  orange: '#ffa500',
  gray: '#808080',
  grey: '#808080',
};
/** Colores que equivalen a «sin color» (el texto normal de la celda). */
const SIN_COLOR = new Set(['windowtext', 'black', '#000000', 'auto', 'inherit', 'initial', 'currentcolor']);

function aHex(valor: string): string | undefined {
  const v = valor.trim().toLowerCase();
  if (!v || SIN_COLOR.has(v)) return undefined;
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${[...v.slice(1)].map((c) => c + c).join('')}`;
  const rgb = v.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgb) {
    const hex = `#${rgb
      .slice(1, 4)
      .map((n) => Number(n).toString(16).padStart(2, '0'))
      .join('')}`;
    return hex === '#000000' ? undefined : hex;
  }
  return NOMBRES[v];
}

/** Reglas «.clase { … }» del <style> de Excel. */
function reglasDeClase(doc: Document): Map<string, Record<string, string>> {
  const reglas = new Map<string, Record<string, string>>();
  const css = [...doc.querySelectorAll('style')]
    .map((s) => s.textContent ?? '')
    .join('\n')
    .replace(/<!--|-->/g, '');
  for (const [, selectores = '', cuerpo = ''] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const decl = declaraciones(cuerpo);
    for (const sel of selectores.split(',')) {
      const m = sel.trim().match(/^(?:[a-z]+)?\.([\w-]+)$/i);
      if (m?.[1]) reglas.set(m[1], { ...reglas.get(m[1]), ...decl });
    }
  }
  return reglas;
}

function declaraciones(texto: string): Record<string, string> {
  const r: Record<string, string> = {};
  for (const parte of texto.split(';')) {
    const i = parte.indexOf(':');
    if (i > 0)
      r[parte.slice(0, i).trim().toLowerCase()] = parte
        .slice(i + 1)
        .trim()
        .replace(/!important/i, '')
        .trim();
  }
  return r;
}

function aplicar(estilo: Estilo, d: Record<string, string>): Estilo {
  const e = { ...estilo };
  const peso = d['font-weight'];
  if (peso) e.negrita = peso === 'bold' || peso === 'bolder' || Number(peso) >= 600;
  if (d['font-style']) e.cursiva = d['font-style'] === 'italic' || d['font-style'] === 'oblique';
  const deco = `${d['text-decoration'] ?? ''} ${d['text-decoration-line'] ?? ''}`;
  if (deco.trim()) {
    e.subrayado = deco.includes('underline');
    e.tachado = deco.includes('line-through');
  }
  const mso = d['text-underline-style'];
  if (mso) e.subrayado = mso !== 'none';
  if (d['color']) e.color = aHex(d['color']);
  return e;
}

function estiloDe(el: Element, base: Estilo, reglas: Map<string, Record<string, string>>): Estilo {
  let e = base;
  for (const clase of el.classList) {
    const r = reglas.get(clase);
    if (r) e = aplicar(e, r);
  }
  const etiqueta = el.tagName.toLowerCase();
  if (etiqueta === 'b' || etiqueta === 'strong') e = { ...e, negrita: true };
  if (etiqueta === 'i' || etiqueta === 'em') e = { ...e, cursiva: true };
  if (etiqueta === 'u') e = { ...e, subrayado: true };
  if (etiqueta === 's' || etiqueta === 'strike' || etiqueta === 'del') e = { ...e, tachado: true };
  const color = el.getAttribute('color');
  if (color) e = { ...e, color: aHex(color) };
  const style = el.getAttribute('style');
  if (style) e = aplicar(e, declaraciones(style));
  return e;
}

function marcas(e: Estilo): Marca[] {
  const m: Marca[] = [];
  if (e.negrita) m.push({ type: 'bold' });
  if (e.cursiva) m.push({ type: 'italic' });
  if (e.subrayado) m.push({ type: 'underline' });
  if (e.tachado) m.push({ type: 'strike' });
  if (e.color) m.push({ type: 'textStyle', attrs: { color: e.color } });
  return m;
}

function leerCelda(celda: Element, reglas: Map<string, Record<string, string>>): CeldaHtml {
  const nodos: Nodo[] = [];
  const recorrer = (n: Node, estilo: Estilo) => {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = (n.textContent ?? '').replace(/\s+/g, ' ');
      if (t) nodos.push({ type: 'text', text: t, marks: marcas(estilo) });
      return;
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const el = n as Element;
    if (el.tagName.toLowerCase() === 'br') {
      nodos.push({ type: 'hardBreak' });
      return;
    }
    const propio = estiloDe(el, estilo, reglas);
    for (const hijo of el.childNodes) recorrer(hijo, propio);
  };
  recorrer(celda, {});

  // Sin espacios sobrantes al inicio y al final; se unen los tramos con las mismas marcas.
  while (nodos[0]?.type === 'hardBreak') nodos.shift();
  const primero = nodos[0];
  if (primero?.type === 'text') primero.text = primero.text.trimStart();
  const ultimo = nodos.at(-1);
  if (ultimo?.type === 'text') ultimo.text = ultimo.text.trimEnd();
  const unidos: Nodo[] = [];
  for (const n of nodos) {
    const previo = unidos.at(-1);
    if (n.type === 'text' && !n.text) continue;
    if (
      n.type === 'text' &&
      previo?.type === 'text' &&
      JSON.stringify(previo.marks) === JSON.stringify(n.marks)
    )
      previo.text += n.text;
    else unidos.push(n);
  }
  const texto = unidos.map((n) => (n.type === 'text' ? n.text : '\n')).join('');
  const conFormato = unidos.some((n) => n.type === 'text' && n.marks?.length);
  if (!conFormato || !texto.trim()) return { texto, contenido: null };
  const contenido = unidos.map((n) =>
    n.type === 'text' && !n.marks?.length ? { type: 'text', text: n.text } : n,
  );
  return {
    texto,
    contenido: {
      type: 'doc',
      content: [{ type: 'paragraph', content: contenido }],
    } as unknown as ContenidoEnriquecido,
  };
}

/** Celdas (con su formato) de la tabla HTML que Excel pone en el portapapeles; sin filas vacías. */
export function leerTablaHtml(html: string): CeldaHtml[][] {
  if (!html.includes('<t')) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const reglas = reglasDeClase(doc);
  return [...doc.querySelectorAll('tr')]
    .map((tr) => [...tr.querySelectorAll('td, th')].map((c) => leerCelda(c, reglas)))
    .filter((fila) => fila.some((c) => c.texto.trim() !== ''));
}
