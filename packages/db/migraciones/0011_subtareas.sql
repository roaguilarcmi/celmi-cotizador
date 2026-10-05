-- 0011 · Subtareas (petición de Rodrigo, 2026-10-05, «al estilo Asana»).
--   · Una subtarea es una tarea hija de otra: un solo nivel (una subtarea no tiene subtareas).
--   · Hereda dueño y oportunidad de su tarea principal; sigue siendo personal (mismas reglas RLS).
--   · Tiene sus propias notas con formato. La fecha es opcional; sin fecha no puede tener avisos.
--   · No se borran: se completan o cancelan, igual que las tareas.

alter table public.tareas add column tarea_padre_id uuid references public.tareas (id) on delete cascade;
create index on public.tareas (tarea_padre_id);

alter table public.tareas alter column vence_en drop not null;
alter table public.tareas add constraint tarea_principal_con_fecha
  check (tarea_padre_id is not null or vence_en is not null);

-- Se ejecuta con los permisos de quien escribe: si la tarea principal no es suya, RLS la oculta y se rechaza.
create function app.reglas_subtarea() returns trigger
language plpgsql set search_path = '' as $$
declare
  padre record;
begin
  if tg_op = 'UPDATE' and new.tarea_padre_id is distinct from old.tarea_padre_id then
    raise exception 'Una subtarea no cambia de tarea principal' using errcode = '42501';
  end if;
  if new.tarea_padre_id is null then
    return new;
  end if;
  select t.oportunidad_id, t.responsable_id, t.tarea_padre_id into padre
  from public.tareas t where t.id = new.tarea_padre_id;
  if not found then
    raise exception 'La tarea principal no existe' using errcode = '42501';
  end if;
  if padre.tarea_padre_id is not null then
    raise exception 'Una subtarea no puede tener subtareas' using errcode = '23514';
  end if;
  if padre.responsable_id is distinct from new.responsable_id then
    raise exception 'Una subtarea es de quien tiene la tarea principal' using errcode = '42501';
  end if;
  new.oportunidad_id := padre.oportunidad_id;
  return new;
end $$;

create trigger subtarea before insert or update on public.tareas
  for each row execute function app.reglas_subtarea();

-- Sin fecha no hay avisos; al quitarle la fecha a una subtarea se quitan sus avisos.
create or replace function app.calcular_aviso() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  vence timestamptz := (select t.vence_en from public.tareas t where t.id = new.tarea_id);
begin
  if vence is null then
    raise exception 'Para programar avisos, la subtarea necesita fecha' using errcode = '23514';
  end if;
  new.aviso_en := vence - make_interval(mins => new.minutos_antes);
  return new;
end $$;

create or replace function app.reprogramar_avisos() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.vence_en is null then
    delete from public.tarea_avisos a where a.tarea_id = new.id;
  elsif new.vence_en is distinct from old.vence_en then
    update public.tarea_avisos a
    set aviso_en = new.vence_en - make_interval(mins => a.minutos_antes)
    where a.tarea_id = new.id;
  end if;
  return null;
end $$;
