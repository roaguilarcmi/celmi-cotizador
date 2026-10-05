-- 0013 · Etapas personalizables y subtareas ordenables (decisiones de Rodrigo, 2026-10-05).
--   · Cada persona arma su propio pipeline de tareas (las tareas son personales): nombre, color y orden.
--   · Hay exactamente una etapa final («Completada» por omisión) que cierra la tarea: se renombra, no se borra.
--   · Debe quedar al menos una etapa abierta. Al borrar una etapa, sus tareas pasan a la primera etapa abierta.
--   · `tareas.estado` sigue siendo el ciclo de vida (pendiente / completada / cancelada) y se sincroniza con la etapa.
--     `en_curso` y `en_espera` (0012) quedan sin uso: ahora son etapas.
--   · Las subtareas tienen `orden` (se reordenan arrastrando).

create table public.etapas_tarea (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  nombre text not null check (length(trim(nombre)) between 1 and 40),
  color text not null default 'neutro' check (color in ('neutro', 'acento', 'aviso', 'exito', 'peligro', 'info')),
  orden int not null default 0,
  es_final boolean not null default false,
  creado_en timestamptz not null default now()
);
create index on public.etapas_tarea (usuario_id, orden);
create unique index etapas_una_final on public.etapas_tarea (usuario_id) where es_final;

alter table public.etapas_tarea enable row level security;
revoke all on public.etapas_tarea from anon;
grant select, insert, update, delete on public.etapas_tarea to authenticated;

create policy etapas_propias on public.etapas_tarea for all to authenticated
  using (app.sesion_valida() and usuario_id = auth.uid())
  with check (app.sesion_valida() and usuario_id = auth.uid());

create trigger auditar after insert or update or delete on public.etapas_tarea
  for each row execute function app.auditar();

-- Etapas por omisión de una persona (si aún no tiene). Las crea el sistema, por eso es security definer.
create function app.crear_etapas_por_omision(usuario uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if usuario is null or exists (select 1 from public.etapas_tarea e where e.usuario_id = usuario) then
    return;
  end if;
  -- Desde la API sólo para uno mismo (sin sesión, p. ej. en esta migración, lo hace el sistema). Para otra persona
  -- no hace nada: las reglas RLS rechazan después lo que corresponda.
  if auth.uid() is not null and usuario <> auth.uid() then
    return;
  end if;
  insert into public.etapas_tarea (usuario_id, nombre, color, orden, es_final) values
    (usuario, 'Por hacer', 'neutro', 0, false),
    (usuario, 'En curso', 'acento', 1, false),
    (usuario, 'En espera', 'aviso', 2, false),
    (usuario, 'Completada', 'exito', 3, true);
end $$;

-- Para la web: garantiza las etapas de quien consulta y las devuelve en orden.
create function public.mis_etapas_tarea() returns setof public.etapas_tarea
language plpgsql set search_path = '' as $$
begin
  if not app.sesion_valida() then
    return;
  end if;
  perform app.crear_etapas_por_omision(auth.uid());
  return query select * from public.etapas_tarea e where e.usuario_id = auth.uid() order by e.orden, e.creado_en;
end $$;
grant execute on function public.mis_etapas_tarea() to authenticated;

create function app.etapa_inicial(usuario uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select e.id from public.etapas_tarea e where e.usuario_id = usuario and not e.es_final order by e.orden, e.creado_en limit 1
$$;

create function app.etapa_final(usuario uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select e.id from public.etapas_tarea e where e.usuario_id = usuario and e.es_final limit 1
$$;

-- La etapa final no deja de serlo, ni otra pasa a serlo.
create function app.reglas_etapa() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.es_final is distinct from old.es_final then
    raise exception 'La etapa final no se cambia' using errcode = '42501';
  end if;
  if new.usuario_id is distinct from old.usuario_id then
    raise exception 'Una etapa no cambia de dueño' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger reglas before update on public.etapas_tarea for each row execute function app.reglas_etapa();

-- Al borrar una etapa: la final no se borra y debe quedar una abierta; sus tareas pasan a la primera abierta.
-- (Si se está borrando el perfil completo, no se estorba la cascada.)
create function app.antes_de_borrar_etapa() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  destino uuid;
begin
  if not exists (select 1 from public.perfiles p where p.id = old.usuario_id) then
    return old;
  end if;
  if old.es_final then
    raise exception 'La etapa final no se puede quitar' using errcode = '42501';
  end if;
  select e.id into destino from public.etapas_tarea e
  where e.usuario_id = old.usuario_id and not e.es_final and e.id <> old.id
  order by e.orden, e.creado_en limit 1;
  if destino is null then
    raise exception 'Debe quedar al menos una etapa abierta' using errcode = '23514';
  end if;
  update public.tareas t set etapa_id = destino where t.etapa_id = old.id;
  return old;
end $$;
create trigger antes_de_borrar before delete on public.etapas_tarea
  for each row execute function app.antes_de_borrar_etapa();

-- ───────────── Tareas: etapa y orden ─────────────
alter table public.tareas add column etapa_id uuid references public.etapas_tarea (id) on delete set null;
alter table public.tareas add column orden int not null default 0;
create index on public.tareas (etapa_id);

-- Las tareas existentes pasan a las etapas por omisión de su dueño.
select app.crear_etapas_por_omision(r.responsable_id) from (select distinct responsable_id from public.tareas) r;
update public.tareas t set etapa_id = e.id
from public.etapas_tarea e
where t.tarea_padre_id is null
  and e.usuario_id = t.responsable_id
  and e.nombre = case t.estado::text
    when 'en_curso' then 'En curso'
    when 'en_espera' then 'En espera'
    when 'completada' then 'Completada'
    else 'Por hacer'
  end;
update public.tareas set estado = 'pendiente' where estado::text in ('en_curso', 'en_espera');
-- Subtareas existentes: orden por fecha de creación.
update public.tareas t set orden = s.n
from (select id, row_number() over (partition by tarea_padre_id order by creado_en) - 1 as n
      from public.tareas where tarea_padre_id is not null) s
where t.id = s.id;

-- Etapa y estado siempre de acuerdo (sólo tareas principales; las subtareas no tienen etapa).
create function app.sincronizar_etapa() returns trigger
language plpgsql set search_path = '' as $$
declare
  final boolean;
  dueno uuid;
begin
  if new.tarea_padre_id is not null then
    new.etapa_id := null;
    if new.estado::text in ('en_curso', 'en_espera') then new.estado := 'pendiente'; end if;
    return new;
  end if;
  if new.estado::text in ('en_curso', 'en_espera') then
    new.estado := 'pendiente';
  end if;
  -- Cambiar de responsable lo rechaza «reglas» con su propio mensaje.
  if tg_op = 'UPDATE' and new.responsable_id is distinct from old.responsable_id then
    return new;
  end if;

  if tg_op = 'INSERT' then
    perform app.crear_etapas_por_omision(new.responsable_id);
    if new.etapa_id is null then
      new.etapa_id := case when new.estado = 'completada'
        then app.etapa_final(new.responsable_id) else app.etapa_inicial(new.responsable_id) end;
    end if;
  elsif new.etapa_id is distinct from old.etapa_id and new.etapa_id is not null then
    -- Moverla de etapa la reabre (o la completa, si es la final), incluso si estaba cancelada.
    select e.es_final into final from public.etapas_tarea e where e.id = new.etapa_id;
    new.estado := case when final then 'completada' else 'pendiente' end;
  elsif new.estado is distinct from old.estado then
    if new.estado = 'completada' then
      new.etapa_id := app.etapa_final(new.responsable_id);
    elsif new.estado = 'pendiente' and old.estado = 'completada' then
      new.etapa_id := app.etapa_inicial(new.responsable_id);
    end if;
  end if;

  if new.etapa_id is not null then
    select e.usuario_id into dueno from public.etapas_tarea e where e.id = new.etapa_id;
    if dueno is distinct from new.responsable_id then
      raise exception 'La etapa no es tuya' using errcode = '42501';
    end if;
    if tg_op = 'INSERT' then
      select e.es_final into final from public.etapas_tarea e where e.id = new.etapa_id;
      new.estado := case when final then 'completada' when new.estado = 'cancelada' then 'cancelada' else 'pendiente' end;
    end if;
  end if;
  return new;
end $$;

-- «etapa» corre antes que «reglas» (orden alfabético), así la fecha de completado se calcula con el estado final.
create trigger etapa before insert or update on public.tareas
  for each row execute function app.sincronizar_etapa();

-- Subtareas nuevas, al final de la lista.
create function app.orden_subtarea() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.tarea_padre_id is not null and new.orden = 0 then
    new.orden := coalesce((select max(t.orden) + 1 from public.tareas t where t.tarea_padre_id = new.tarea_padre_id), 0);
  end if;
  return new;
end $$;
create trigger orden_subtarea before insert on public.tareas
  for each row execute function app.orden_subtarea();
