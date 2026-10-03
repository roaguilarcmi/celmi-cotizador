/** Configuración pública de Supabase (apps/web/.env.local). */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

/**
 * Sin configuración la web funciona en «modo demostración» (pantallas con datos de muestra y sin inicio de
 * sesión), para poder seguir diseñando antes de conectar Supabase.
 */
export const supabaseConfigurado = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

/** Rutas a las que se entra sin sesión completa (inicio de sesión, 2FA y enlaces del administrador). */
export const RUTAS_ACCESO = ['/entrar', '/acceso', '/restablecer'];

export const esRutaDeAcceso = (ruta: string) =>
  RUTAS_ACCESO.some((r) => ruta === r || ruta.startsWith(`${r}/`));
