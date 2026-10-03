-- 0001 · Esquema base del Cotizador CELMI
-- Montos en numeric (exactos). El cálculo de precios vive en @celmi/core; el servidor registra los valores
-- definitivos (RFP §3.6). Las tablas de información interna (costos, utilidad) están separadas para que la
-- base de datos misma impida leerlas sin permiso (RFP §34-35).

create schema if not exists app;

-- ───────────── Roles y permisos (configurables, nunca por persona: RFP §4) ─────────────
create table public.roles (
  id text primary key,
  nombre text not null,
  descripcion text not null default ''
);

create table public.permisos (
  id text primary key,
  descripcion text not null
);

create table public.rol_permisos (
  rol_id text not null references public.roles (id) on delete cascade,
  permiso_id text not null references public.permisos (id) on delete cascade,
  primary key (rol_id, permiso_id)
);

-- Un perfil por usuario de Supabase Auth. Sólo entra quien tenga perfil activo (alta por el administrador).
create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  correo text not null unique,
  puesto text not null default '',
  rol_id text not null references public.roles (id),
  activo boolean not null default true,
  -- Preferencias visuales (columnas de la corrida, menú compacto…).
  preferencias jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now()
);

create table public.configuracion (
  clave text primary key,
  valor jsonb not null
);

-- ───────────── Catálogos ─────────────
create table public.monedas (
  codigo text primary key check (codigo ~ '^[A-Z]{3}$'),
  nombre text not null,
  activa boolean not null default true
);

create table public.unidades (
  id text primary key,
  nombre text not null unique,
  -- Abreviatura que se imprime en el PDF (PIEZA → PZA).
  abreviatura text,
  activa boolean not null default true
);

create table public.mayoristas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activo boolean not null default true
);

create table public.marcas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activa boolean not null default true
);

create table public.estados_oportunidad (
  id text primary key,
  nombre text not null,
  orden int not null,
  final boolean not null default false,
  activo boolean not null default true
);

create table public.esquemas_adquisicion (
  id text primary key,
  nombre text not null,
  plazos_meses int[] not null default '{}',
  activo boolean not null default true
);

-- ───────────── Clientes ─────────────
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  razon_social text not null,
  rfc text,
  direccion text not null default '',
  ciudad text not null default '',
  creado_por uuid references public.perfiles (id),
  creado_en timestamptz not null default now()
);

create table public.contactos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  tratamiento text not null default '',
  nombre text not null,
  puesto text not null default '',
  correo text not null default '',
  telefono text not null default ''
);

-- ───────────── Oportunidades ─────────────
create table public.oportunidades (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id),
  contacto_id uuid references public.contactos (id),
  nombre text not null,
  ejecutivo_id uuid not null references public.perfiles (id),
  estado_id text not null default 'nueva' references public.estados_oportunidad (id),
  esquema_id text references public.esquemas_adquisicion (id),
  ciudad_entrega text not null default '',
  observaciones_internas text not null default '',
  creado_en timestamptz not null default now()
);

-- Personas que colaboran en una oportunidad ajena (p. ej. el Cotizador/Operador que captura partidas).
create table public.oportunidad_colaboradores (
  oportunidad_id uuid not null references public.oportunidades (id) on delete cascade,
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  primary key (oportunidad_id, perfil_id)
);

-- ───────────── Cotizaciones, revisiones, propuestas y partidas ─────────────
create table public.cotizaciones (
  id uuid primary key default gen_random_uuid(),
  oportunidad_id uuid not null references public.oportunidades (id),
  -- Folio CELMISOLUTIONS-AAAA###### asignado sólo por public.asignar_folio().
  folio text unique,
  folio_anio int,
  folio_consecutivo int,
  creado_por uuid references public.perfiles (id),
  creado_en timestamptz not null default now(),
  unique (folio_anio, folio_consecutivo),
  check ((folio is null) = (folio_anio is null) and (folio_anio is null) = (folio_consecutivo is null))
);

-- Último consecutivo por año (se reinicia cada año: regla confirmada 2026-10-02).
create table public.folios (
  anio int primary key,
  ultimo int not null check (ultimo > 0)
);

create type public.motivo_revision as enum ('inicial', 'solicitud_cliente', 'mejora_precio');
create type public.estado_revision as enum (
  'borrador',
  'pendiente_autorizacion',
  'autorizada',
  'rechazada',
  'emitida'
);

create table public.revisiones (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references public.cotizaciones (id) on delete cascade,
  -- 0 = original; 1, 2, 3… = revisiones (el formato «Rev A» está pendiente de confirmar).
  numero int not null check (numero >= 0),
  revision_anterior_id uuid references public.revisiones (id),
  motivo public.motivo_revision not null default 'inicial',
  estado public.estado_revision not null default 'borrador',
  autorizada_por uuid references public.perfiles (id),
  autorizada_en timestamptz,
  creado_por uuid references public.perfiles (id),
  creado_en timestamptz not null default now(),
  unique (cotizacion_id, numero)
);

create table public.propuestas (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.revisiones (id) on delete cascade,
  orden int not null,
  nombre text not null,
  tipo text not null default '',
  modalidad text not null default '',
  unique (revision_id, orden) deferrable initially deferred
);

create table public.partidas (
  id uuid primary key default gen_random_uuid(),
  propuesta_id uuid not null references public.propuestas (id) on delete cascade,
  orden int not null,
  sku text not null default '',
  marca_id uuid references public.marcas (id),
  -- Texto enriquecido (Fase 3).
  descripcion text not null,
  entrega text not null default '',
  unidad_id text references public.unidades (id),
  cantidad int not null check (cantidad > 0),
  oculta_al_cliente boolean not null default false,
  unique (propuesta_id, orden) deferrable initially deferred
);

-- Información interna: costos de compra (permiso costos.ver).
create table public.partida_costos (
  partida_id uuid primary key references public.partidas (id) on delete cascade,
  mayorista_id uuid references public.mayoristas (id),
  moneda text not null default 'MXN' references public.monedas (codigo),
  costo_unitario numeric(14, 2) not null check (costo_unitario >= 0),
  -- «Precio anterior» antes de una mejora de precio del mayorista.
  costo_anterior numeric(14, 2) check (costo_anterior > 0),
  tipo_cambio numeric(12, 6) not null default 1 check (tipo_cambio > 0),
  vigencia date
);

-- Información interna: utilidad (sólo quien autoriza la ve).
create table public.partida_utilidad (
  partida_id uuid primary key references public.partidas (id) on delete cascade,
  utilidad_pct numeric(9, 4) not null check (utilidad_pct >= 0)
);

-- Precio de venta autorizado: lo calcula y registra el servidor con @celmi/core.
create table public.partida_precios (
  partida_id uuid primary key references public.partidas (id) on delete cascade,
  precio_unitario numeric(14, 2) not null check (precio_unitario >= 0),
  autorizado_por uuid references public.perfiles (id),
  autorizado_en timestamptz
);

-- Registro de accesos (RFP §32): lo escribe el servidor.
create table public.accesos (
  id bigint generated always as identity primary key,
  usuario_id uuid references auth.users (id) on delete set null,
  correo text,
  evento text not null check (
    evento in ('inicio', 'cierre', 'fallido', 'mfa_inscrito', 'mfa_restablecido', 'recuperacion', 'bloqueo')
  ),
  ip text,
  agente text,
  en timestamptz not null default now()
);

create index on public.perfiles (rol_id);
create index on public.contactos (cliente_id);
create index on public.oportunidades (ejecutivo_id);
create index on public.oportunidades (cliente_id);
create index on public.oportunidad_colaboradores (perfil_id);
create index on public.cotizaciones (oportunidad_id);
create index on public.revisiones (cotizacion_id);
create index on public.propuestas (revision_id);
create index on public.partidas (propuesta_id);
create index on public.accesos (usuario_id, en desc);
