-- 0008 · Varios avisos por tarea, tareas editables y texto con formato (decisiones 2026-10-05).
--   · Cada aviso se guarda como «minutos antes del vencimiento»; su hora se recalcula sola al reprogramar.
--   · Notas de tareas y de seguimiento con formato: documento JSON validado por la aplicación (lista blanca de
--     nodos y marcas); el texto simple se conserva para búsquedas y avisos.

-- ───────────── Avisos ─────────────
create table public.tarea_avisos (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references public.tareas (id) on delete cascade,
  minutos_antes int not null check (minutos_antes between 0 and 43200),
  aviso_en timestamptz not null,
  unique (tarea_id, minutos_antes)
);
create index on public.tarea_avisos (aviso_en);

-- Los avisos existentes (uno por tarea) pasan a la tabla nueva.
insert into public.tarea_avisos (tarea_id, minutos_antes, aviso_en)
select id, greatest(0, round(extract(epoch from (vence_en - aviso_en)) / 60))::int, aviso_en
from public.tareas
where aviso_en is not null;

alter table public.tareas drop column aviso_en;

create function app.es_mi_tarea(tarea uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.sesion_valida()
     and exists (select 1 from public.tareas t where t.id = tarea and t.responsable_id = auth.uid())
$$;
grant execute on function app.es_mi_tarea(uuid) to authenticated;

alter table public.tarea_avisos enable row level security;
revoke all on public.tarea_avisos from anon;
-- Para cambiar los avisos se borran y se vuelven a crear; la hora la calcula la base.
grant select, insert, delete on public.tarea_avisos to authenticated;

create policy avisos_ver on public.tarea_avisos for select to authenticated using (app.es_mi_tarea(tarea_id));
create policy avisos_alta on public.tarea_avisos for insert to authenticated with check (app.es_mi_tarea(tarea_id));
create policy avisos_baja on public.tarea_avisos for delete to authenticated using (app.es_mi_tarea(tarea_id));

-- La hora del aviso siempre se deriva del vencimiento: nunca se captura.
create function app.calcular_aviso() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.aviso_en := (select t.vence_en from public.tareas t where t.id = new.tarea_id)
                  - make_interval(mins => new.minutos_antes);
  return new;
end $$;

create trigger calcular before insert on public.tarea_avisos for each row execute function app.calcular_aviso();

create function app.reprogramar_avisos() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.vence_en is distinct from old.vence_en then
    update public.tarea_avisos a
    set aviso_en = new.vence_en - make_interval(mins => a.minutos_antes)
    where a.tarea_id = new.id;
  end if;
  return null;
end $$;

create trigger reprogramar after update of vence_en on public.tareas
  for each row execute function app.reprogramar_avisos();

create trigger auditar after insert or delete on public.tarea_avisos for each row execute function app.auditar();

-- ───────────── Texto con formato ─────────────
alter table public.tareas add column notas jsonb check (notas is null or jsonb_typeof(notas) = 'object');
alter table public.seguimiento add column contenido jsonb check (contenido is null or jsonb_typeof(contenido) = 'object');
