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
    'id, oportunidad_id, autor_id, tipo, texto, contenido, estado_anterior, estado_nuevo, en, editado_en, autor:perfiles!seguimiento_autor_id_fkey(nombre)',
  perfilSesion: 'nombre, puesto, correo, roles(nombre)',
  tareas:
    'id, oportunidad_id, titulo, descripcion, notas, vence_en, sin_hora, estado, completada_en, avisos:tarea_avisos(id, minutos_antes, aviso_en), oportunidad:oportunidades(id, nombre, cliente:clientes(razon_social)), subtareas:tareas!tarea_padre_id(id, titulo, descripcion, notas, vence_en, sin_hora, estado, completada_en, creado_en, avisos:tarea_avisos(id, minutos_antes, aviso_en))',
  borradores: 'tipo, datos, actualizado_en',
} as const;

/** Tabla de cada consulta (para la verificación). */
export const TABLA_DE_CONSULTA: Record<keyof typeof CONSULTAS, string> = {
  estados: 'estados_oportunidad',
  esquemas: 'esquemas_adquisicion',
  clientes: 'clientes',
  oportunidades: 'oportunidades',
  seguimiento: 'seguimiento',
  perfilSesion: 'perfiles',
  tareas: 'tareas',
  borradores: 'borradores',
};
