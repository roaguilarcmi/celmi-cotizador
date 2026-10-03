-- 0004 · Datos iniciales: permisos, roles (RFP §4-5) y catálogos observados en la cotización EPOXEMEX.
-- Los usuarios se dan de alta desde la aplicación (requieren cuenta en Supabase Auth).

insert into public.configuracion (clave, valor) values
  ('folio', '{"prefijo": "CELMISOLUTIONS", "digitos": 6}'),
  ('iva', '{"tasa_pct": "16"}');

insert into public.permisos (id, descripcion) values
  ('usuarios.administrar', 'Dar de alta usuarios, asignar roles y restablecer su segundo factor'),
  ('catalogos.administrar', 'Administrar catálogos y configuración general'),
  ('condiciones.administrar', 'Administrar el catálogo de condiciones comerciales'),
  ('clientes.ver', 'Consultar clientes y contactos'),
  ('clientes.crear', 'Dar de alta clientes y contactos'),
  ('clientes.editar', 'Modificar clientes y contactos'),
  ('oportunidades.crear', 'Crear oportunidades a su nombre'),
  ('oportunidades.ver_todas', 'Consultar las oportunidades de todos los ejecutivos'),
  ('oportunidades.editar_todas', 'Modificar las oportunidades de todos los ejecutivos'),
  ('costos.ver', 'Ver y capturar costos de compra de las partidas'),
  ('utilidad.ver', 'Ver utilidad y márgenes'),
  ('utilidad.autorizar', 'Definir utilidad, autorizar precios y bloquear partidas'),
  ('tipo_cambio.capturar', 'Capturar el tipo de cambio'),
  ('modificaciones.autorizar', 'Autorizar modificaciones a cotizaciones ya autorizadas'),
  ('auditoria.ver', 'Consultar la auditoría y el registro de accesos'),
  ('pdf.emitir', 'Generar el PDF de cotizaciones autorizadas');

insert into public.roles (id, nombre, descripcion) values
  ('administrador', 'Administrador / Autorizador', 'Gerencia: autoriza precios y administra el sistema'),
  ('ejecutivo', 'Ejecutivo', 'Preventa y desarrollo de negocios: prepara oportunidades y cotizaciones'),
  ('cotizador', 'Cotizador / Operador', 'Captura partidas y completa cotizaciones en las oportunidades donde colabora');

-- Administrador: todos los permisos.
insert into public.rol_permisos (rol_id, permiso_id) select 'administrador', id from public.permisos;

-- Ejecutivo: ve costos pero no utilidad (decisión 2026-10-03); sólo sus oportunidades.
insert into public.rol_permisos (rol_id, permiso_id) values
  ('ejecutivo', 'clientes.ver'),
  ('ejecutivo', 'clientes.crear'),
  ('ejecutivo', 'oportunidades.crear'),
  ('ejecutivo', 'costos.ver'),
  ('ejecutivo', 'pdf.emitir');

-- Cotizador / Operador: permisos configurables (RFP §5.3); inicia con lo mínimo para capturar.
insert into public.rol_permisos (rol_id, permiso_id) values
  ('cotizador', 'clientes.ver'),
  ('cotizador', 'costos.ver'),
  ('cotizador', 'pdf.emitir');

insert into public.monedas (codigo, nombre) values
  ('MXN', 'Peso mexicano'),
  ('USD', 'Dólar estadounidense');

-- La abreviatura de SERVICIO en el PDF está pendiente de confirmar.
insert into public.unidades (id, nombre, abreviatura) values
  ('pieza', 'PIEZA', 'PZA'),
  ('servicio', 'SERVICIO', null);

insert into public.mayoristas (nombre) values ('CVA'), ('Ingram Micro'), ('CT Internacional'), ('Amazon');
insert into public.marcas (nombre) values ('DELL'), ('KINGSTON');

insert into public.estados_oportunidad (id, nombre, orden, final) values
  ('nueva', 'Nueva', 1, false),
  ('en_preparacion', 'En preparación', 2, false),
  ('pendiente_autorizacion', 'Pendiente de autorización', 3, false),
  ('autorizada', 'Cotización autorizada', 4, false),
  ('enviada', 'Cotizada / Enviada al cliente', 5, false),
  ('en_negociacion', 'En negociación', 6, false),
  ('ganada', 'Ganada', 7, true),
  ('perdida', 'Perdida', 8, true),
  ('abandonada', 'Abandonada', 9, true),
  ('cancelada', 'Cancelada', 10, true);

insert into public.esquemas_adquisicion (id, nombre, plazos_meses) values
  ('adquisicion', 'Adquisición', '{}'),
  ('arrendamiento_vjm', 'Arrendamiento a Valor Justo de Mercado', '{24,36,48,60}'),
  ('arrendamiento_fpo', 'Arrendamiento Full Payout', '{24,36,48,60}'),
  ('credito_simple', 'Crédito simple', '{12,24,36,48}');
