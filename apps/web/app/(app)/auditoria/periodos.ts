/** Periodos del filtro «Cuándo» de la auditoría (días hacia atrás; 0 = todo). */
export const PERIODOS = {
  '1': { texto: 'Hoy y ayer', dias: 2 },
  '7': { texto: 'Últimos 7 días', dias: 7 },
  '30': { texto: 'Últimos 30 días', dias: 30 },
  '90': { texto: 'Últimos 3 meses', dias: 90 },
  '365': { texto: 'Último año', dias: 365 },
  todo: { texto: 'Todo', dias: 0 },
} as const;
export type Periodo = keyof typeof PERIODOS;
