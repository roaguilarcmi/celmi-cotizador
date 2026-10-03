import { radios, temas, type PaletaTema } from './tokens.ts';

const kebab = (s: string) => s.replace(/[A-Z0-9]/g, (c) => `-${c.toLowerCase()}`);

function variables(p: PaletaTema, sangria: string): string {
  return Object.entries(p)
    .map(([k, v]) => `${sangria}--c-${kebab(k)}: ${v};`)
    .join('\n');
}

/** Genera theme.css: variables por tema (claro/oscuro) y su mapeo a utilidades de Tailwind v4. */
export function generarCSS(): string {
  const colores = Object.keys(temas.claro)
    .map((k) => `  --color-${kebab(k)}: var(--c-${kebab(k)});`)
    .join('\n');
  const rad = Object.entries(radios)
    .map(([k, v]) => `  --radius-${k}: ${v}px;`)
    .join('\n');
  return `/* GENERADO por packages/ui/scripts/gen-css.ts a partir de tokens.ts. No editar a mano. */

:root {
  color-scheme: light;
${variables(temas.claro, '  ')}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    color-scheme: dark;
${variables(temas.oscuro, '    ')}
  }
}

:root[data-theme='dark'] {
  color-scheme: dark;
${variables(temas.oscuro, '  ')}
}

@theme inline {
${colores}
${rad}
  --font-sans: var(--font-jakarta), 'Plus Jakarta Sans', system-ui, sans-serif;
}
`;
}
