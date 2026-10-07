import { describe, expect, it } from 'vitest';
import { esFinDeSemana, vigenciaSugerida } from './vigencia';

describe('vigencia', () => {
  // 2026-10-07 es miércoles.
  it('suma días naturales cuando cae entre semana', () => {
    expect(vigenciaSugerida('2026-10-07', 1)).toBe('2026-10-08'); // jueves
    expect(vigenciaSugerida('2026-10-07', 7)).toBe('2026-10-14'); // miércoles
    expect(vigenciaSugerida('2026-10-07', 15)).toBe('2026-10-22'); // jueves
  });

  it('si cae en sábado o domingo pasa al lunes siguiente', () => {
    expect(vigenciaSugerida('2026-10-07', 3)).toBe('2026-10-12'); // sábado 10 → lunes 12
    expect(vigenciaSugerida('2026-10-07', 4)).toBe('2026-10-12'); // domingo 11 → lunes 12
    expect(vigenciaSugerida('2026-10-07', 10)).toBe('2026-10-19'); // sábado 17 → lunes 19
  });

  it('cruza meses y años', () => {
    expect(vigenciaSugerida('2026-12-28', 7)).toBe('2027-01-04'); // lunes
    expect(vigenciaSugerida('2026-01-28', 3)).toBe('2026-02-02'); // sábado 31 → lunes 2
  });

  it('reconoce fines de semana y rechaza fechas no válidas', () => {
    expect(esFinDeSemana('2026-10-10')).toBe(true);
    expect(esFinDeSemana('2026-10-11')).toBe(true);
    expect(esFinDeSemana('2026-10-12')).toBe(false);
    expect(() => esFinDeSemana('2026-02-30')).toThrow();
    expect(() => vigenciaSugerida('2026-10-07', -1)).toThrow();
  });
});
