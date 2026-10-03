-- 0006 · Fase 2: seguimiento de oportunidades y reglas confirmadas el 2026-10-03.
--   · El estado de una oportunidad lo cambian su ejecutivo y los administradores (no los colaboradores).
--   · Reasignar una oportunidad a otro ejecutivo sólo lo hace un administrador.
--   · Los ejecutivos pueden editar clientes y contactos (queda en la auditoría).

insert into public.rol_permisos (rol_id, permiso_id) values ('ejecutivo', 'clientes.editar');

-- ───────────── Bitácora de seguimiento ─────────────
create type public.tipo_seguimiento as enum ('nota', 'llamada', 'visita', 'correo', 'cambio_estado');

create table public.seguimiento (
  id uuid primary key default gen_random_uuid(),
  oportunidad_id uuid not null references public.oportunidades (id) on delete cascade,
  autor_id uuid references public.perfiles (id),
  tipo public.tipo_seguimiento not null,
  texto text not null default '',
  estado_anterior text references public.estados_oportunidad (id),
  estado_nuevo text references public.estados_oportunidad (id),
  en timestamptz not null default now()
);
create index on public.seguimiento (oportunidad_id, en desc);
create index on public.seguimiento (en desc);

alter table public.seguimiento enable row level security;
revoke all on public.seguimiento from anon;
-- Bitácora: se agrega, no se edita ni se borra.
grant select, insert on public.seguimiento to authenticated;

create policy seguimiento_ver on public.seguimiento for select to authenticated
  using (app.puede_ver_oportunidad(oportunidad_id));
-- Las notas las escribe quien participa, a su nombre; los cambios de estado los registra el disparador.
create policy seguimiento_alta on public.seguimiento for insert to authenticated
  with check (
    app.puede_editar_oportunidad(oportunidad_id)
    and autor_id = auth.uid()
    and tipo <> 'cambio_estado'
  );

create trigger auditar after insert on public.seguimiento for each row execute function app.auditar();

-- ───────────── Reglas de cambio de estado y de reasignación ─────────────
create function app.reglas_oportunidad() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- auth.uid() nulo = mantenimiento desde el servidor de base de datos (migraciones, scripts).
  if auth.uid() is not null then
    if new.estado_id is distinct from old.estado_id
       and old.ejecutivo_id <> auth.uid()
       and not app.tiene_permiso('oportunidades.editar_todas') then
      raise exception 'Sólo el ejecutivo de la oportunidad o un administrador cambian su estado'
        using errcode = '42501';
    end if;
    if new.ejecutivo_id is distinct from old.ejecutivo_id
       and not app.tiene_permiso('oportunidades.editar_todas') then
      raise exception 'Sólo un administrador reasigna oportunidades' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create trigger reglas before update on public.oportunidades
  for each row execute function app.reglas_oportunidad();

-- Cada cambio de estado queda en la bitácora con quién lo hizo.
create function app.registrar_cambio_estado() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.estado_id is distinct from old.estado_id then
    insert into public.seguimiento (oportunidad_id, autor_id, tipo, estado_anterior, estado_nuevo)
    values (new.id, auth.uid(), 'cambio_estado', old.estado_id, new.estado_id);
  end if;
  return null;
end $$;

create trigger bitacora_estado after update of estado_id on public.oportunidades
  for each row execute function app.registrar_cambio_estado();

-- Fecha del último movimiento, para ordenar el tablero por actividad reciente.
alter table public.oportunidades add column actualizado_en timestamptz not null default now();

create function app.tocar_oportunidad() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.oportunidades set actualizado_en = now() where id = new.oportunidad_id;
  return null;
end $$;

create trigger tocar after insert on public.seguimiento for each row execute function app.tocar_oportunidad();

create function app.fecha_actualizacion() returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end $$;

create trigger fecha before update on public.oportunidades
  for each row execute function app.fecha_actualizacion();

-- La auditoría ignora cambios que sólo tocan la fecha de última actividad (no son cambios de negocio).
create or replace function app.auditar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  fila jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  if tg_op = 'UPDATE' and (to_jsonb(old) - 'actualizado_en') = (to_jsonb(new) - 'actualizado_en') then
    return null;
  end if;
  insert into public.auditoria (usuario_id, tabla, registro_id, accion, antes, despues)
  values (
    auth.uid(),
    tg_table_name,
    coalesce(
      fila ->> 'id',
      fila ->> 'partida_id',
      fila ->> 'codigo',
      fila ->> 'clave',
      concat_ws(':', fila ->> 'oportunidad_id', fila ->> 'perfil_id', fila ->> 'rol_id', fila ->> 'permiso_id')
    ),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end $$;
