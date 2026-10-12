import { describe, expect, it } from 'vitest';
import { esFinDeSemana, fechaValida, finDeMesHabil, vigenciaFinanciera, vigenciaSugerida } from './vigencia';

describe('vigencia', () => {
  it('fechas a medio escribir no truenan y no cuentan como válidas (2026-10-12)', () => {
    expect(() => vigenciaSugerida('0002-11-08', 15)).not.toThrow();
    expect(fechaValida('0002-11-08')).toBe(false);
    expect(fechaValida('2026-02-30')).toBe(false);
    expect(fechaValida('2026-11-08')).toBe(true);
    expect(fechaValida('')).toBe(false);
  });

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

describe('vigenciaFinanciera (2026-10-12)', () => {
  it('si cae en fin de semana regresa al viernes inmediato anterior', () => {
    expect(vigenciaFinanciera('2026-10-07', 15)).toBe('2026-10-22'); // jueves, sin cambio
    expect(vigenciaFinanciera('2026-10-03', 15)).toBe('2026-10-16'); // domingo 18 → viernes 16
    expect(vigenciaFinanciera('2026-10-02', 15)).toBe('2026-10-16'); // sábado 17 → viernes 16
    expect(vigenciaFinanciera('2026-10-01', 30)).toBe('2026-10-30'); // sábado 31 → viernes 30
  });
});

describe('finDeMesHabil', () => {
  it('último día del mes, o el viernes anterior si cae en fin de semana', () => {
    expect(finDeMesHabil('2026-10-07')).toBe('2026-10-30'); // 31 oct 2026 es sábado → viernes 30
    expect(finDeMesHabil('2026-11-15')).toBe('2026-11-30'); // lunes 30
    expect(finDeMesHabil('2026-05-02')).toBe('2026-05-29'); // 31 may es domingo → viernes 29
    expect(finDeMesHabil('2028-02-10')).toBe('2028-02-29'); // bisiesto, martes
  });
});
