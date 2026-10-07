-- 0024 · Decisiones de Rodrigo, 2026-10-07.
--   · Estado de la República en el cliente y estado de entrega en la oportunidad (lista cerrada). La autorización
--     alerta cuando la entrega es fuera de Ciudad de México, Estado de México, Hidalgo o Morelos.
--   · Cada revisión de una cotización tiene su esquema (Adquisición, Arrendamiento o Crédito simple; por omisión, el
--     de la oportunidad) y, en arrendamiento, el mayorista con el que se trabaja el arrendamiento. Sólo se cambian en
--     borrador y la Rev nueva los hereda. Para enviar un arrendamiento a autorización hay que indicar el mayorista.
--   · Adquisición: quien autoriza fija el % de anticipo (obligatorio, 0–100) sobre el total con IVA.
--   · Arrendamiento con mayorista distinto del proveedor: quien autoriza fija un % de transaccionalidad que se suma a la
--     utilidad (precio = costo × T.C. × (1 + (utilidad + transaccionalidad) %)), en todas las partidas o sólo en las de
--     proveedor distinto. Se guarda por partida.

create function app.estados_mx() returns text[]
language sql immutable as $$
  select array['Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua',
               'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Estado de México', 'Guanajuato', 'Guerrero',
               'Hidalgo', 'Jalisco', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro',
               'Quintana Roo', 'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala',
               'Veracruz', 'Yucatán', 'Zacatecas']
$$;

alter table public.clientes add column estado text check (estado is null or estado = any (app.estados_mx()));
alter table public.oportunidades add column estado_entrega text
  check (estado_entrega is null or estado_entrega = any (app.estados_mx()));

-- ───────────── Esquema y datos de la autorización por revisión ─────────────
alter table public.revisiones
  add column esquema text check (esquema in ('adquisicion', 'arrendamiento', 'credito_simple')),
  add column mayorista_arrendamiento_id uuid references public.mayoristas (id),
  add column anticipo_pct numeric(7, 4) check (anticipo_pct between 0 and 100),
  add column transaccion_pct numeric(7, 4) check (transaccion_pct between 0 and 100),
  add column transaccion_alcance text check (transaccion_alcance in ('todas', 'diferentes'));

update public.revisiones r set esquema = o.tipo
from public.cotizaciones c join public.oportunidades o on o.id = c.oportunidad_id
where c.id = r.cotizacion_id;
update public.revisiones set esquema = 'arrendamiento' where esquema is null;

-- Revisión nueva sin esquema: el de su oportunidad.
create function app.esquema_por_omision() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.esquema is null then
    new.esquema := coalesce(
      (select o.tipo from public.cotizaciones c join public.oportunidades o on o.id = c.oportunidad_id
       where c.id = new.cotizacion_id),
      'arrendamiento');
  end if;
  return new;
end $$;
create trigger esquema_por_omision before insert on public.revisiones
  for each row execute function app.esquema_por_omision();
alter table public.revisiones alter column esquema set not null;

-- Esquema y mayorista de arrendamiento: sólo en borrador. Anticipo y transaccionalidad: sólo quien autoriza.
-- Para enviar un arrendamiento a autorización, el mayorista es obligatorio.
create function app.reglas_datos_revision() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.esquema is distinct from old.esquema
      or new.mayorista_arrendamiento_id is distinct from old.mayorista_arrendamiento_id)
     and old.estado <> 'borrador' and old.estado = new.estado then
    raise exception 'El esquema y el mayorista del arrendamiento se cambian sólo en borrador' using errcode = '42501';
  end if;
  if (new.anticipo_pct is distinct from old.anticipo_pct or new.transaccion_pct is distinct from old.transaccion_pct
      or new.transaccion_alcance is distinct from old.transaccion_alcance)
     and not app.tiene_permiso('utilidad.autorizar') and old.estado = new.estado then
    raise exception 'El anticipo y la transaccionalidad los define quien autoriza' using errcode = '42501';
  end if;
  if new.estado = 'pendiente_autorizacion' and old.estado is distinct from new.estado
     and new.esquema = 'arrendamiento' and new.mayorista_arrendamiento_id is null then
    raise exception 'Indica con qué mayorista se trabaja el arrendamiento' using errcode = '23514';
  end if;
  -- Fuera de arrendamiento no hay mayorista de arrendamiento.
  if new.esquema <> 'arrendamiento' then
    new.mayorista_arrendamiento_id := null;
  end if;
  return new;
end $$;
create trigger reglas_datos before update on public.revisiones
  for each row execute function app.reglas_datos_revision();

alter table public.partida_utilidad
  add column transaccion_pct numeric(7, 4) not null default 0 check (transaccion_pct between 0 and 100);

-- ───────────── Nueva revisión: hereda esquema y mayorista ─────────────
create or replace function app.heredar_esquema() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.revision_anterior_id is not null then
    select r.esquema, r.mayorista_arrendamiento_id into new.esquema, new.mayorista_arrendamiento_id
    from public.revisiones r where r.id = new.revision_anterior_id;
  end if;
  return new;
end $$;
-- Corre antes que esquema_por_omision (orden alfabético de los disparadores).
create trigger a_heredar_esquema before insert on public.revisiones
  for each row execute function app.heredar_esquema();

-- ───────────── Autorización con transaccionalidad y anticipo ─────────────
drop function public.guardar_utilidades(uuid, jsonb, jsonb);
drop function public.autorizar_revision(uuid, jsonb, jsonb, text);
drop function app.leer_utilidades(uuid, jsonb, boolean);

create function app.leer_utilidades(revision uuid, partidas jsonb, completa boolean)
returns table (partida_id uuid, utilidad numeric, transaccion numeric, precio numeric, costo numeric,
               tipo_cambio numeric)
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
                                or e.utilidad_pct <> round(e.utilidad_pct, 4) or e.utilidad_pct > 99999
                                or coalesce(e.transaccion_pct, 0) < 0 or coalesce(e.transaccion_pct, 0) > 100
                                or coalesce(e.transaccion_pct, 0) <> round(coalesce(e.transaccion_pct, 0), 4)),
         count(*) - count(distinct e.partida_id),
         count(*) filter (where not exists (
           select 1 from public.partidas pa join public.propuestas pr on pr.id = pa.propuesta_id
           where pa.id = e.partida_id and pr.revision_id = revision))
    into invalidas, repetidas, ajenas
  from jsonb_to_recordset(partidas) as e(partida_id uuid, utilidad_pct numeric, transaccion_pct numeric);
  if invalidas > 0 then
    raise exception 'La utilidad y la transaccionalidad son porcentajes de 0 o más con hasta 4 decimales'
      using errcode = '23514';
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
    select e.partida_id, e.utilidad_pct, coalesce(e.transaccion_pct, 0), e.precio_unitario, c.costo_unitario,
           app.tipo_cambio_de_partida(e.partida_id)
    from jsonb_to_recordset(partidas)
           as e(partida_id uuid, utilidad_pct numeric, transaccion_pct numeric, precio_unitario numeric)
    left join public.partida_costos c on c.partida_id = e.partida_id;
end $$;

-- Datos de la autorización a nivel revisión (anticipo y transaccionalidad); valida que apliquen al esquema.
create function app.guardar_datos_autorizacion(revision uuid, datos jsonb) returns void
language plpgsql set search_path = '' as $$
declare
  esq text;
  anticipo numeric := nullif(datos->>'anticipo_pct', '')::numeric;
  transaccion numeric := nullif(datos->>'transaccion_pct', '')::numeric;
  alcance text := nullif(datos->>'transaccion_alcance', '');
begin
  select r.esquema into esq from public.revisiones r where r.id = revision;
  if anticipo is not null and esq <> 'adquisicion' then
    raise exception 'El anticipo sólo aplica en adquisición' using errcode = '23514';
  end if;
  if transaccion is not null and esq <> 'arrendamiento' then
    raise exception 'La transaccionalidad sólo aplica en arrendamiento' using errcode = '23514';
  end if;
  if transaccion is not null and transaccion > 0 and alcance is null then
    raise exception 'Indica si la transaccionalidad va en todas las partidas o sólo en las de otro proveedor'
      using errcode = '23514';
  end if;
  update public.revisiones
  set anticipo_pct = anticipo, transaccion_pct = transaccion,
      transaccion_alcance = case when coalesce(transaccion, 0) > 0 then alcance end
  where id = revision;
end $$;

create function public.guardar_utilidades(revision uuid, partidas jsonb, tipos_cambio jsonb default '{}',
                                          datos jsonb default '{}') returns void
language plpgsql set search_path = '' as $$
begin
  if not app.tiene_permiso('utilidad.autorizar') then
    raise exception 'No tienes permiso para definir la utilidad' using errcode = '42501';
  end if;
  if (select r.estado from public.revisiones r where r.id = revision) is distinct from 'pendiente_autorizacion' then
    raise exception 'La utilidad se define mientras la revisión espera autorización' using errcode = '42501';
  end if;
  perform app.guardar_tipos_cambio(revision, tipos_cambio);
  perform app.guardar_datos_autorizacion(revision, datos);
  insert into public.partida_utilidad (partida_id, utilidad_pct, transaccion_pct)
  select u.partida_id, u.utilidad, u.transaccion from app.leer_utilidades(revision, partidas, false) u
  on conflict (partida_id) do update
    set utilidad_pct = excluded.utilidad_pct, transaccion_pct = excluded.transaccion_pct;
end $$;
revoke execute on function public.guardar_utilidades(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.guardar_utilidades(uuid, jsonb, jsonb, jsonb) to authenticated;

create function public.autorizar_revision(revision uuid, partidas jsonb, tipos_cambio jsonb default '{}',
                                          comentario text default '', datos jsonb default '{}') returns void
language plpgsql set search_path = '' as $$
declare
  sin_tc text;
  distintos int;
  esq text;
begin
  if not app.tiene_permiso('utilidad.autorizar') then
    raise exception 'No tienes permiso para autorizar' using errcode = '42501';
  end if;
  select r.esquema into esq from public.revisiones r
  where r.id = revision and r.estado = 'pendiente_autorizacion' for update;
  if not found then
    raise exception 'Sólo se autoriza una revisión que espera autorización' using errcode = '23514';
  end if;
  perform app.guardar_tipos_cambio(revision, tipos_cambio);
  perform app.guardar_datos_autorizacion(revision, datos);
  if esq = 'adquisicion' and (select r.anticipo_pct from public.revisiones r where r.id = revision) is null then
    raise exception 'Indica el porcentaje de anticipo' using errcode = '23514';
  end if;

  select string_agg(distinct c.moneda, ', ') into sin_tc
  from public.partidas pa join public.propuestas pr on pr.id = pa.propuesta_id
  join public.partida_costos c on c.partida_id = pa.id
  where pr.revision_id = revision and c.moneda <> 'MXN'
    and not exists (select 1 from public.revision_tipos_cambio t where t.revision_id = revision and t.moneda = c.moneda);
  if sin_tc is not null then
    raise exception 'Indica el tipo de cambio de %', sin_tc using errcode = '23514';
  end if;
  if esq <> 'arrendamiento' and exists (
       select 1 from jsonb_to_recordset(partidas) as e(transaccion_pct numeric) where coalesce(e.transaccion_pct, 0) > 0) then
    raise exception 'La transaccionalidad sólo aplica en arrendamiento' using errcode = '23514';
  end if;

  -- Mismo cálculo que @celmi/core: costo × T.C. × (1 + (utilidad + transaccionalidad) %), redondeado a centavos.
  select count(*) into distintos from app.leer_utilidades(revision, partidas, true) a
  where a.costo is null or a.precio is null
     or a.precio <> round(a.costo * a.tipo_cambio * (100 + a.utilidad + a.transaccion) * 0.01, 2);
  if distintos > 0 then
    raise exception 'Los precios no coinciden con la utilidad (% partida(s)); vuelve a cargar la corrida', distintos
      using errcode = '23514';
  end if;

  insert into public.partida_utilidad (partida_id, utilidad_pct, transaccion_pct)
  select a.partida_id, a.utilidad, a.transaccion from app.leer_utilidades(revision, partidas, false) a
  on conflict (partida_id) do update
    set utilidad_pct = excluded.utilidad_pct, transaccion_pct = excluded.transaccion_pct;
  insert into public.partida_precios (partida_id, precio_unitario)
  select a.partida_id, a.precio from app.leer_utilidades(revision, partidas, false) a
  on conflict (partida_id) do update set precio_unitario = excluded.precio_unitario;

  update public.revisiones
  set estado = 'autorizada', comentario_autorizacion = left(coalesce(trim(comentario), ''), 2000)
  where id = revision;
end $$;
revoke execute on function public.autorizar_revision(uuid, jsonb, jsonb, text, jsonb) from public, anon;
grant execute on function public.autorizar_revision(uuid, jsonb, jsonb, text, jsonb) to authenticated;
