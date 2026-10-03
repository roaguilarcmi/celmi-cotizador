import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generarCSS } from './css.ts';
import { temas } from './tokens.ts';

function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contraste = (a: string, b: string) => {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m) as [number, number];
  return (x + 0.05) / (y + 0.05);
};

describe('sistema de diseño', () => {
  it('theme.css está sincronizado con tokens.ts (ejecuta `npm run gen -w @celmi/ui` si falla)', () => {
    const actual = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');
    expect(actual).toBe(generarCSS());
  });

  for (const [nombre, p] of Object.entries(temas)) {
    it(`tema ${nombre} cumple contraste WCAG AA en textos principales`, () => {
      expect(contraste(p.texto, p.fondo)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(p.texto, p.superficie)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(p.textoSuave, p.superficie)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(p.sobreAcento, p.acento)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(p.acentoTexto, p.superficie)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(p.navTexto, p.nav)).toBeGreaterThanOrEqual(4.5);
      for (const k of ['exito', 'aviso', 'peligro', 'info', 'neutro'] as const) {
        expect(contraste(p[k], p[`${k}Suave`]), k).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
