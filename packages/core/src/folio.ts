export interface ConfigFolio {
  prefijo: string;
  /** Dígitos del consecutivo anual. */
  digitos: number;
}

/** Estructura confirmada: CELMISOLUTIONS-2026001253 = prefijo-año + consecutivo de 6 dígitos que se reinicia cada año. */
export const FOLIO_CELMI: ConfigFolio = { prefijo: 'CELMISOLUTIONS', digitos: 6 };

/**
 * Da formato a un folio. La asignación del consecutivo (único, sin repeticiones y reiniciado cada año)
 * la hace el servidor dentro de una transacción; esta función sólo formatea.
 */
export function formatearFolio(anio: number, consecutivo: number, cfg: ConfigFolio = FOLIO_CELMI): string {
  if (!Number.isInteger(anio) || anio < 2000 || anio > 9999) throw new Error('Año inválido');
  if (!Number.isInteger(consecutivo) || consecutivo < 1 || consecutivo >= 10 ** cfg.digitos) {
    throw new Error(`El consecutivo debe estar entre 1 y ${10 ** cfg.digitos - 1}`);
  }
  return `${cfg.prefijo}-${anio}${String(consecutivo).padStart(cfg.digitos, '0')}`;
}
