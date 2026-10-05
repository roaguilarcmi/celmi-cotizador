-- 0017 · Fase 3: tipo general de la oportunidad, condiciones predefinidas y propuesta de financiamiento
-- (decisiones de Rodrigo, 2026-10-05).

-- ───────────── Oportunidad: sólo el tipo general ─────────────
-- Los esquemas específicos se eligen por propuesta (financiamiento). esquema_id queda como dato histórico.
alter table public.oportunidades
  add column tipo text not null default 'arrendamiento' check (tipo in ('adquisicion', 'arrendamiento'));
update public.oportunidades set tipo = case when esquema_id = 'adquisicion' then 'adquisicion' else 'arrendamiento' end;

-- ───────────── Catálogo de condiciones comerciales ─────────────
create table public.condiciones_comerciales (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) between 1 and 120),
  -- Texto con formato (JSON validado por la aplicación). Puede incluir «{vigencia}».
  contenido jsonb not null check (jsonb_typeof(contenido) = 'object'),
  orden int not null default 0,
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);
alter table public.condiciones_comerciales enable row level security;
revoke all on public.condiciones_comerciales from anon;
grant select, insert, update on public.condiciones_comerciales to authenticated;
create policy condiciones_ver on public.condiciones_comerciales for select to authenticated using (app.sesion_valida());
create policy condiciones_alta on public.condiciones_comerciales for insert to authenticated
  with check (app.tiene_permiso('catalogos.administrar'));
create policy condiciones_editar on public.condiciones_comerciales for update to authenticated
  using (app.tiene_permiso('catalogos.administrar')) with check (app.tiene_permiso('catalogos.administrar'));
create trigger auditar after insert or update on public.condiciones_comerciales
  for each row execute function app.auditar();

-- ───────────── Condiciones de cada revisión (ajustables sólo para esa cotización) ─────────────
create table public.revision_condiciones (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.revisiones (id) on delete cascade,
  orden int not null,
  -- De qué condición del catálogo salió (null si se borró del catálogo o se escribió aparte).
  condicion_id uuid references public.condiciones_comerciales (id) on delete set null,
  contenido jsonb not null check (jsonb_typeof(contenido) = 'object')
);
create index on public.revision_condiciones (revision_id, orden);
alter table public.revision_condiciones enable row level security;
revoke all on public.revision_condiciones from anon;
grant select, insert, delete on public.revision_condiciones to authenticated;
create policy rc_ver on public.revision_condiciones for select to authenticated
  using (app.puede_ver_oportunidad(app.oportunidad_de_revision(revision_id)));
create policy rc_alta on public.revision_condiciones for insert to authenticated
  with check (app.puede_modificar_revision(revision_id));
create policy rc_baja on public.revision_condiciones for delete to authenticated
  using (app.puede_modificar_revision(revision_id));
create trigger auditar after insert or delete on public.revision_condiciones
  for each row execute function app.auditar();

-- Guarda las condiciones elegidas de una revisión, en orden (reemplaza las anteriores).
create function public.guardar_condiciones(revision uuid, condiciones jsonb) returns void
language plpgsql set search_path = '' as $$
declare
  c jsonb;
  n int := 0;
begin
  if jsonb_typeof(condiciones) <> 'array' then
    raise exception 'Formato no válido' using errcode = '22023';
  end if;
  if app.revision_bloqueada(revision) and not app.tiene_permiso('modificaciones.autorizar') then
    raise exception 'La revisión ya no se puede modificar (está en autorización o autorizada)' using errcode = '42501';
  end if;
  delete from public.revision_condiciones where revision_id = revision;
  for c in select * from jsonb_array_elements(condiciones) loop
    n := n + 1;
    insert into public.revision_condiciones (revision_id, orden, condicion_id, contenido)
    values (revision, n, nullif(c->>'condicion_id', '')::uuid, c->'contenido');
  end loop;
end $$;
revoke execute on function public.guardar_condiciones(uuid, jsonb) from public, anon;
grant execute on function public.guardar_condiciones(uuid, jsonb) to authenticated;

-- Una revisión nueva (Rev A…) hereda las condiciones de la anterior.
create function app.heredar_condiciones() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.revision_anterior_id is not null then
    insert into public.revision_condiciones (revision_id, orden, condicion_id, contenido)
    select new.id, rc.orden, rc.condicion_id, rc.contenido
    from public.revision_condiciones rc where rc.revision_id = new.revision_anterior_id;
  end if;
  return null;
end $$;
create trigger heredar_condiciones after insert on public.revisiones
  for each row execute function app.heredar_condiciones();

-- ───────────── Propuesta de financiamiento ─────────────
create function app.revision_de_propuesta(propuesta uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select p.revision_id from public.propuestas p where p.id = propuesta
$$;

create table public.propuesta_financiamientos (
  id uuid primary key default gen_random_uuid(),
  propuesta_id uuid not null references public.propuestas (id) on delete cascade,
  esquema_id text not null references public.esquemas_adquisicion (id),
  plazo_meses int not null check (plazo_meses between 1 and 240),
  mensualidad numeric(14, 2) check (mensualidad >= 0),
  valor_residual numeric(14, 2) check (valor_residual >= 0),
  factor numeric(12, 6) check (factor >= 0),
  tasa_interes numeric(8, 4) check (tasa_interes >= 0),
  gastos_apertura numeric(14, 2) check (gastos_apertura >= 0),
  orden int not null default 0,
  unique (propuesta_id, esquema_id, plazo_meses)
);
create index on public.propuesta_financiamientos (propuesta_id);
alter table public.propuesta_financiamientos enable row level security;
revoke all on public.propuesta_financiamientos from anon;
grant select, insert, delete on public.propuesta_financiamientos to authenticated;

-- Se captura después de la autorización de precios (y antes de emitir), por quien prepara la cotización.
create function app.puede_capturar_financiamiento(propuesta uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.puede_editar_oportunidad(app.oportunidad_de_revision(app.revision_de_propuesta(propuesta)))
     and coalesce((select r.estado = 'autorizada' from public.revisiones r
                   where r.id = app.revision_de_propuesta(propuesta)), false)
$$;
create policy fin_ver on public.propuesta_financiamientos for select to authenticated
  using (app.puede_ver_oportunidad(app.oportunidad_de_revision(app.revision_de_propuesta(propuesta_id))));
create policy fin_alta on public.propuesta_financiamientos for insert to authenticated
  with check (app.puede_capturar_financiamiento(propuesta_id));
create policy fin_baja on public.propuesta_financiamientos for delete to authenticated
  using (app.puede_capturar_financiamiento(propuesta_id));
create trigger auditar after insert or delete on public.propuesta_financiamientos
  for each row execute function app.auditar();

create function app.reglas_financiamiento() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.esquema_id = 'adquisicion' then
    raise exception 'La adquisición no es un esquema de financiamiento' using errcode = '23514';
  end if;
  if (select p.es_adicional from public.propuestas p where p.id = new.propuesta_id) then
    raise exception 'El financiamiento se captura en las propuestas principales' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger reglas before insert on public.propuesta_financiamientos
  for each row execute function app.reglas_financiamiento();

-- Guarda el financiamiento de todas las propuestas de una revisión (reemplaza lo anterior).
create function public.guardar_financiamiento(revision uuid, filas jsonb) returns void
language plpgsql set search_path = '' as $$
declare
  f jsonb;
  n int := 0;
begin
  if jsonb_typeof(filas) <> 'array' then
    raise exception 'Formato no válido' using errcode = '22023';
  end if;
  if not coalesce((select r.estado = 'autorizada' from public.revisiones r where r.id = revision), false) then
    raise exception 'El financiamiento se captura cuando los precios ya están autorizados' using errcode = '42501';
  end if;
  delete from public.propuesta_financiamientos x using public.propuestas p
  where x.propuesta_id = p.id and p.revision_id = revision;
  for f in select * from jsonb_array_elements(filas) loop
    n := n + 1;
    if app.revision_de_propuesta((f->>'propuesta_id')::uuid) is distinct from revision then
      raise exception 'Propuesta no válida' using errcode = '42501';
    end if;
    insert into public.propuesta_financiamientos (propuesta_id, esquema_id, plazo_meses, mensualidad, valor_residual,
                                                  factor, tasa_interes, gastos_apertura, orden)
    values ((f->>'propuesta_id')::uuid, f->>'esquema_id', (f->>'plazo_meses')::int,
            nullif(f->>'mensualidad', '')::numeric, nullif(f->>'valor_residual', '')::numeric,
            nullif(f->>'factor', '')::numeric, nullif(f->>'tasa_interes', '')::numeric,
            nullif(f->>'gastos_apertura', '')::numeric, n);
  end loop;
end $$;
revoke execute on function public.guardar_financiamiento(uuid, jsonb) from public, anon;
grant execute on function public.guardar_financiamiento(uuid, jsonb) to authenticated;
