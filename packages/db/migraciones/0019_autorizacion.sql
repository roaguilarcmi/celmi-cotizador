-- 0019 · Fase 3C: autorización de precios por quien tiene «utilidad.autorizar» (Alejandro).
--   · La utilidad de cada partida (también adicionales y cargos, cada uno con la suya) sólo se define mientras la
--     revisión espera autorización; se puede guardar el avance sin autorizar (guardar_utilidades).
--   · autorizar_revision registra utilidad y precio de TODAS las partidas y autoriza en una sola transacción.
--     El servidor calcula los precios con @celmi/core; la base los vuelve a calcular y rechaza cualquier diferencia.
--   · Se guarda el precio propio de cada partida; las líneas del cliente (incluidos sumados, cargos prorrateados) se
--     derivan de esos precios con @celmi/core, así que siempre dan lo mismo.

-- ───────────── Utilidad: sólo mientras espera autorización ─────────────
create function app.utilidad_en_pendiente() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select r.estado from public.revisiones r where r.id = app.revision_de_partida(new.partida_id))
     is distinct from 'pendiente_autorizacion' then
    raise exception 'La utilidad se define mientras la revisión espera autorización' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger en_pendiente before insert or update on public.partida_utilidad
  for each row execute function app.utilidad_en_pendiente();

-- Lee la lista [{partida_id, utilidad_pct, precio_unitario?}], verifica que corresponda a la revisión (y, si
-- «completa», que estén todas sus partidas) y la devuelve con el costo de cada partida.
create function app.leer_utilidades(revision uuid, partidas jsonb, completa boolean)
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
    select e.partida_id, e.utilidad_pct, e.precio_unitario, c.costo_unitario, c.tipo_cambio
    from jsonb_to_recordset(partidas) as e(partida_id uuid, utilidad_pct numeric, precio_unitario numeric)
    left join public.partida_costos c on c.partida_id = e.partida_id;
end $$;

-- Avance sin autorizar. Se ejecuta con los permisos de quien lo pide: RLS exige «utilidad.autorizar».
create function public.guardar_utilidades(revision uuid, partidas jsonb) returns void
language plpgsql set search_path = '' as $$
begin
  if not app.tiene_permiso('utilidad.autorizar') then
    raise exception 'No tienes permiso para definir la utilidad' using errcode = '42501';
  end if;
  insert into public.partida_utilidad (partida_id, utilidad_pct)
  select u.partida_id, u.utilidad from app.leer_utilidades(revision, partidas, false) u
  on conflict (partida_id) do update set utilidad_pct = excluded.utilidad_pct;
end $$;
revoke execute on function public.guardar_utilidades(uuid, jsonb) from public, anon;
grant execute on function public.guardar_utilidades(uuid, jsonb) to authenticated;

create function public.autorizar_revision(revision uuid, partidas jsonb, comentario text default '') returns void
language plpgsql set search_path = '' as $$
declare
  distintos int;
begin
  if not app.tiene_permiso('utilidad.autorizar') then
    raise exception 'No tienes permiso para autorizar' using errcode = '42501';
  end if;
  perform 1 from public.revisiones r where r.id = revision and r.estado = 'pendiente_autorizacion' for update;
  if not found then
    raise exception 'Sólo se autoriza una revisión que espera autorización' using errcode = '23514';
  end if;

  -- Mismo cálculo que @celmi/core: costo × tipo de cambio × (1 + utilidad), redondeado a centavos (mitad hacia
  -- arriba; los montos nunca son negativos). Multiplicar por 0.01 es exacto en numeric.
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
revoke execute on function public.autorizar_revision(uuid, jsonb, text) from public, anon;
grant execute on function public.autorizar_revision(uuid, jsonb, text) to authenticated;
