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
  oportunidades: `id, nombre, estado_id, esquema_id, tipo, ciudad_entrega, observaciones_internas, creado_en, actualizado_en,
    ejecutivo_id, cliente:clientes(id, razon_social), contacto:contactos(id, tratamiento, nombre, puesto, correo, telefono),
    ejecutivo:perfiles!oportunidades_ejecutivo_id_fkey(id, nombre)`,
  seguimiento:
    'id, oportunidad_id, autor_id, tipo, texto, contenido, estado_anterior, estado_nuevo, en, editado_en, autor:perfiles!seguimiento_autor_id_fkey(nombre)',
  perfilSesion: 'nombre, puesto, correo, roles(nombre)',
  tareas:
    'id, oportunidad_id, titulo, descripcion, notas, vence_en, sin_hora, estado, etapa_id, completada_en, avisos:tarea_avisos(id, minutos_antes, aviso_en), oportunidad:oportunidades(id, nombre, cliente:clientes(razon_social)), subtareas:tareas!tarea_padre_id(id, titulo, descripcion, notas, vence_en, sin_hora, estado, orden, completada_en, creado_en, avisos:tarea_avisos(id, minutos_antes, aviso_en))',
  borradores: 'tipo, datos, actualizado_en',
  etapas: 'id, nombre, color, orden, es_final',
  cotizaciones: `id, oportunidad_id, folio, creado_en,
    oportunidad:oportunidades(id, nombre, ejecutivo_id, tipo, cliente:clientes(razon_social),
      ejecutivo:perfiles!oportunidades_ejecutivo_id_fkey(nombre)),
    revisiones(id, numero, estado, motivo, creado_en, enviada_en, autorizada_en, comentario_autorizacion,
      autor:perfiles!revisiones_creado_por_fkey(nombre), autorizador:perfiles!revisiones_autorizada_por_fkey(nombre))`,
  revision: `id, cotizacion_id, numero, estado, motivo, vigencia_hasta, condiciones, comentario_autorizacion,
    enviada_en, autorizada_en, revision_anterior_id,
    propuestas(id, orden, nombre, tipo, es_adicional, propuesta_origen_id,
      partidas(id, orden, sku, marca_id, descripcion, descripcion_contenido, entrega, unidad_id, cantidad, se_suma,
        partida_padre_id, partida_origen_id, presentacion, prorrateos:partida_prorrateos!partida_id(destino_id),
        oculta_al_cliente,
        costo:partida_costos(mayorista_id, moneda, costo_unitario, costo_anterior, tipo_cambio, vigencia),
        precio:partida_precios(precio_unitario)))`,
  utilidades: 'partida_id, utilidad_pct',
  tiposCambio: 'moneda, tipo_cambio',
  bandeja: `id, numero, estado, enviada_en, autorizada_en, comentario_autorizacion,
    cotizacion:cotizaciones(id, folio, oportunidad:oportunidades(id, nombre, cliente:clientes(razon_social),
      ejecutivo:perfiles!oportunidades_ejecutivo_id_fkey(nombre))),
    propuestas(id, partidas(id, cantidad, partida_padre_id, presentacion,
      costo:partida_costos(costo_unitario, tipo_cambio)))`,
  mayoristas: 'id, nombre, activo',
  marcas: 'id, nombre, activa',
  unidades: 'id, nombre, abreviatura, activa',
  monedas: 'codigo, nombre, activa',
  condiciones: 'id, nombre, contenido, orden, activa',
  revisionCondiciones: 'id, orden, condicion_id, contenido',
  financiamientos:
    'id, propuesta_id, esquema_id, plazo_meses, mensualidad, valor_residual, factor, tasa_interes, gastos_apertura, orden',
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
  etapas: 'etapas_tarea',
  cotizaciones: 'cotizaciones',
  revision: 'revisiones',
  utilidades: 'partida_utilidad',
  tiposCambio: 'revision_tipos_cambio',
  bandeja: 'revisiones',
  mayoristas: 'mayoristas',
  marcas: 'marcas',
  unidades: 'unidades',
  monedas: 'monedas',
  condiciones: 'condiciones_comerciales',
  revisionCondiciones: 'revision_condiciones',
  financiamientos: 'propuesta_financiamientos',
};
