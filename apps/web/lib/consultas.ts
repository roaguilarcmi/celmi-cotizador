/**
 * Columnas de las consultas a la API de Supabase (PostgREST). Viven aquí, sin dependencias del servidor, para que
 * `scripts/verificar-consultas.mjs` pueda probarlas contra la base real.
 *
 * Cuando dos tablas tienen más de una relación (oportunidades ↔ perfiles: por el ejecutivo y por los
 * colaboradores), el embebido debe nombrar la llave foránea; si no, la API rechaza la consulta (PGRST201).
 */
export const CONSULTAS = {
  estados: 'id, nombre, orden, final, activo',
  esquemas: 'id, nombre, plazos_meses, activo',
  clientes:
    'id, razon_social, rfc, direccion, ciudad, creado_en, contactos(id, cliente_id, tratamiento, nombre, puesto, correo, telefono), oportunidades(id)',
  oportunidades: `id, nombre, estado_id, esquema_id, ciudad_entrega, observaciones_internas, creado_en, actualizado_en,
    ejecutivo_id, cliente:clientes(id, razon_social), contacto:contactos(id, tratamiento, nombre, puesto, correo, telefono),
    ejecutivo:perfiles!oportunidades_ejecutivo_id_fkey(id, nombre)`,
  seguimiento:
    'id, oportunidad_id, tipo, texto, estado_anterior, estado_nuevo, en, autor:perfiles!seguimiento_autor_id_fkey(nombre)',
  perfilSesion: 'nombre, puesto, correo, roles(nombre)',
} as const;

/** Tabla de cada consulta (para la verificación). */
export const TABLA_DE_CONSULTA: Record<keyof typeof CONSULTAS, string> = {
  estados: 'estados_oportunidad',
  esquemas: 'esquemas_adquisicion',
  clientes: 'clientes',
  oportunidades: 'oportunidades',
  seguimiento: 'seguimiento',
  perfilSesion: 'perfiles',
};
