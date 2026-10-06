-- 0020 · Tipo de cambio en la autorización (decisión de Rodrigo, 2026-10-06).
--   · Quien autoriza fija el T.C. de cada moneda extranjera en cada autorización (revision_tipos_cambio). El T.C. que
--     captura el ejecutivo en la partida queda como referencia y propuesta inicial.
--   · Para autorizar debe haber T.C. de cada moneda extranjera de la revisión; los precios se verifican con él.
--   · «Precio nunca bajo el costo» usa el T.C. autorizado cuando existe.

create table public.revision_tipos_cambio (
  revision_id uuid not null references public.revisiones (id) on delete cascade,
  moneda text not null references public.monedas (codigo) check (moneda <> 'MXN'),
  tipo_cambio numeric(12, 5) not null check (tipo_cambio > 0),
  definido_por uuid references public.perfiles (id) default auth.uid(),
  definido_en timestamptz not null default now(),
  primary key (revision_id, moneda)
);

alter table public.revision_tipos_cambio enable row level security;
revoke all on public.revision_tipos_cambio from anon;
grant select, insert, update on public.revision_tipos_cambio to authenticated;

create policy tipos_cambio_ver on public.revision_tipos_cambio for select to authenticated
  using (app.puede_ver_oportunidad(app.oportunidad_de_revision(revision_id)));
create policy tipos_cambio_alta on public.revision_tipos_cambio for insert to authenticated
  with check (app.tiene_permiso('utilidad.autorizar'));
create policy tipos_cambio_editar on public.revision_tipos_cambio for update to authenticated
  using (app.tiene_permiso('utilidad.autorizar')) with check (app.tiene_permiso('utilidad.autorizar'));

create function app.tipo_cambio_en_pendiente() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select r.estado from public.revisiones r where r.id = new.revision_id) is distinct from 'pendiente_autorizacion' then
    raise exception 'El tipo de cambio se define mientras la revisión espera autorización' using errcode = '42501';
  end if;
  new.definido_por := auth.uid();
  new.definido_en := now();
  return new;
end $$;
create trigger en_pendiente before insert or update on public.revision_tipos_cambio
  for each row execute function app.tipo_cambio_en_pendiente();
create trigger auditar after insert or update or delete on public.revision_tipos_cambio
  for each row execute function app.auditar();

-- T.C. con el que se calcula una partida: 1 en pesos; el autorizado de su revisión o, si aún no hay, el capturado.
create function app.tipo_cambio_de_partida(partida uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select case when c.moneda = 'MXN' then 1
              else coalesce((select t.tipo_cambio from public.revision_tipos_cambio t
                             where t.revision_id = app.revision_de_partida(partida) and t.moneda = c.moneda),
                            c.tipo_cambio) end
  from public.partida_costos c where c.partida_id = partida
$$;

create or replace function app.precio_sobre_costo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  costo numeric;
begin
  select round(c.costo_unitario * app.tipo_cambio_de_partida(c.partida_id), 2) into costo
  from public.partida_costos c where c.partida_id = new.partida_id;
  if costo is null then
    raise exception 'La partida no tiene costo' using errcode = '23514';
  end if;
  if new.precio_unitario < costo then
    raise exception 'El precio no puede ser menor que el costo (no hay utilidad negativa)' using errcode = '23514';
  end if;
  if (select r.estado from public.revisiones r where r.id = app.revision_de_partida(new.partida_id)) <> 'pendiente_autorizacion' then
    raise exception 'Los precios se registran al autorizar' using errcode = '42501';
  end if;
  new.autorizado_por := auth.uid();
  new.autorizado_en := now();
  return new;
end $$;

-- Devuelve el T.C. efectivo de cada partida (en lugar del capturado).
create or replace function app.leer_utilidades(revision uuid, partidas jsonb, completa boolean)
returns table (partida_id uuid, utilidad numeric, precio numeric, costo numeric, tipo_cambio numeric)
language plpgsql stable set search_path = '' as $$
declare
  invalidas int;
  repetidas int;
  ajenas int;
  faltantes int;
begin
  if jsonb_typeof(partidas) is distinct from 'array' then
    raise exception 'Formato no válido' using errcode = '22023';
  end if;
  select count(*) filter (where e.partida_id is null or e.utilidad_pct is null or e.utilidad_pct < 0
                                or e.utilidad_pct <> round(e.utilidad_pct, 4) or e.utilidad_pct > 99999),
         count(*) - count(distinct e.partida_id),
         count(*) filter (where not exists (
           select 1 from public.partidas pa join public.propuestas pr on pr.id = pa.propuesta_id
           where pa.id = e.partida_id and pr.revision_id = revision))
    into invalidas, repetidas, ajenas
  from jsonb_to_recordset(partidas) as e(partida_id uuid, utilidad_pct numeric, precio_unitario numeric);
  if invalidas > 0 then
    raise exception 'La utilidad debe ser un porcentaje de 0 o más con hasta 4 decimales' using errcode = '23514';
  end if;
  if repetidas > 0 or ajenas > 0 then
    raise exception 'Hay partidas que no son de esta revisión' using errcode = '22023';
  end if;
  if completa then
    select count(*) into faltantes from public.partidas pa join public.propuestas pr on pr.id = pa.propuesta_id
    where pr.revision_id = revision
      and not exists (select 1 from jsonb_to_recordset(partidas) as e(partida_id uuid) where e.partida_id = pa.id);
    if faltantes > 0 then
      raise exception 'Falta la utilidad de % partida(s)', faltantes using errcode = '23514';
    end if;
  end if;
  return query
    select e.partida_id, e.utilidad_pct, e.precio_unitario, c.costo_unitario, app.tipo_cambio_de_partida(e.partida_id)
    from jsonb_to_recordset(partidas) as e(partida_id uuid, utilidad_pct numeric, precio_unitario numeric)
    left join public.partida_costos c on c.partida_id = e.partida_id;
end $$;

-- Registra los T.C. recibidos ({"USD": "18.12345"}): monedas extranjeras de la revisión, hasta 5 decimales.
create function app.guardar_tipos_cambio(revision uuid, tipos jsonb) returns void
language plpgsql set search_path = '' as $$
begin
  if jsonb_typeof(tipos) is distinct from 'object' then
    raise exception 'Formato no válido' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each_text(tipos) t
             where t.key !~ '^[A-Z]{3}$' or t.key = 'MXN' or t.value !~ '^\d+(\.\d{1,5})?$' or t.value::numeric <= 0) then
    raise exception 'El tipo de cambio debe ser mayor que cero, con hasta 5 decimales' using errcode = '23514';
  end if;
  insert into public.revision_tipos_cambio (revision_id, moneda, tipo_cambio)
  select revision, t.key, t.value::numeric from jsonb_each_text(tipos) t
  on conflict (revision_id, moneda) do update set tipo_cambio = excluded.tipo_cambio;
end $$;

drop function public.guardar_utilidades(uuid, jsonb);
drop function public.autorizar_revision(uuid, jsonb, text);

create function public.guardar_utilidades(revision uuid, partidas jsonb, tipos_cambio jsonb default '{}')
returns void
language plpgsql set search_path = '' as $$
begin
  if not app.tiene_permiso('utilidad.autorizar') then
    raise exception 'No tienes permiso para definir la utilidad' using errcode = '42501';
  end if;
  perform app.guardar_tipos_cambio(revision, tipos_cambio);
  insert into public.partida_utilidad (partida_id, utilidad_pct)
  select u.partida_id, u.utilidad from app.leer_utilidades(revision, partidas, false) u
  on conflict (partida_id) do update set utilidad_pct = excluded.utilidad_pct;
end $$;
revoke execute on function public.guardar_utilidades(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.guardar_utilidades(uuid, jsonb, jsonb) to authenticated;

create function public.autorizar_revision(revision uuid, partidas jsonb, tipos_cambio jsonb default '{}',
                                          comentario text default '') returns void
language plpgsql set search_path = '' as $$
declare
  sin_tc text;
  distintos int;
begin
  if not app.tiene_permiso('utilidad.autorizar') then
    raise exception 'No tienes permiso para autorizar' using errcode = '42501';
  end if;
  perform 1 from public.revisiones r where r.id = revision and r.estado = 'pendiente_autorizacion' for update;
  if not found then
    raise exception 'Sólo se autoriza una revisión que espera autorización' using errcode = '23514';
  end if;

  perform app.guardar_tipos_cambio(revision, tipos_cambio);
  select string_agg(distinct c.moneda, ', ') into sin_tc
  from public.partidas pa join public.propuestas pr on pr.id = pa.propuesta_id
  join public.partida_costos c on c.partida_id = pa.id
  where pr.revision_id = revision and c.moneda <> 'MXN'
    and not exists (select 1 from public.revision_tipos_cambio t where t.revision_id = revision and t.moneda = c.moneda);
  if sin_tc is not null then
    raise exception 'Indica el tipo de cambio de %', sin_tc using errcode = '23514';
  end if;

  -- Mismo cálculo que @celmi/core: costo × T.C. × (1 + utilidad), redondeado a centavos (mitad hacia arriba;
  -- los montos nunca son negativos). Multiplicar por 0.01 es exacto en numeric.
  select count(*) into distintos from app.leer_utilidades(revision, partidas, true) a
  where a.costo is null or a.precio is null
     or a.precio <> round(a.costo * a.tipo_cambio * (100 + a.utilidad) * 0.01, 2);
  if distintos > 0 then
    raise exception 'Los precios no coinciden con la utilidad (% partida(s)); vuelve a cargar la corrida', distintos
      using errcode = '23514';
  end if;

  insert into public.partida_utilidad (partida_id, utilidad_pct)
  select a.partida_id, a.utilidad from app.leer_utilidades(revision, partidas, false) a
  on conflict (partida_id) do update set utilidad_pct = excluded.utilidad_pct;
  insert into public.partida_precios (partida_id, precio_unitario)
  select a.partida_id, a.precio from app.leer_utilidades(revision, partidas, false) a
  on conflict (partida_id) do update set precio_unitario = excluded.precio_unitario;

  update public.revisiones
  set estado = 'autorizada', comentario_autorizacion = left(coalesce(trim(comentario), ''), 2000)
  where id = revision;
end $$;
revoke execute on function public.autorizar_revision(uuid, jsonb, jsonb, text) from public, anon;
grant execute on function public.autorizar_revision(uuid, jsonb, jsonb, text) to authenticated;
