-- 0029 · Paquetes de condiciones comerciales (decisión de Rodrigo, 2026-10-10).
-- Un paquete es una lista ordenada de condiciones que se carga de un clic en la cotización (reemplaza las actuales).
-- Cualquiera que cotiza (permiso costos.ver) crea paquetes; los edita o elimina quien lo creó o un administrador.

create table public.paquetes_condiciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) between 1 and 80),
  creado_por uuid references public.perfiles (id) on delete set null default auth.uid(),
  creado_en timestamptz not null default now(),
  activo boolean not null default true
);
create unique index paquetes_condiciones_nombre on public.paquetes_condiciones (lower(trim(nombre))) where activo;

create table public.paquete_condiciones (
  id uuid primary key default gen_random_uuid(),
  paquete_id uuid not null references public.paquetes_condiciones (id) on delete cascade,
  orden int not null,
  condicion_id uuid references public.condiciones_comerciales (id) on delete set null,
  -- Null: se usa el texto vigente del catálogo. Con valor: texto ajustado o condición propia.
  contenido jsonb check (contenido is null or jsonb_typeof(contenido) = 'object'),
  check (condicion_id is not null or contenido is not null)
);
create index on public.paquete_condiciones (paquete_id, orden);

-- Quien lo creó o un administrador.
create function app.puede_editar_paquete(paquete uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.sesion_valida() and exists (
    select 1 from public.paquetes_condiciones p
    where p.id = paquete
      and (p.creado_por = auth.uid() or app.tiene_permiso('catalogos.administrar'))
  )
$$;
revoke execute on function app.puede_editar_paquete(uuid) from public, anon;
grant execute on function app.puede_editar_paquete(uuid) to authenticated;

alter table public.paquetes_condiciones enable row level security;
revoke all on public.paquetes_condiciones from anon;
grant select, insert (nombre, creado_por), update (nombre, activo) on public.paquetes_condiciones to authenticated;
create policy paquetes_ver on public.paquetes_condiciones for select to authenticated using (app.sesion_valida());
create policy paquetes_alta on public.paquetes_condiciones for insert to authenticated
  with check (app.tiene_permiso('costos.ver') and creado_por = auth.uid());
create policy paquetes_editar on public.paquetes_condiciones for update to authenticated
  using (app.puede_editar_paquete(id)) with check (app.puede_editar_paquete(id));
create trigger auditar after insert or update on public.paquetes_condiciones
  for each row execute function app.auditar();

alter table public.paquete_condiciones enable row level security;
revoke all on public.paquete_condiciones from anon;
grant select, insert, delete on public.paquete_condiciones to authenticated;
create policy pc_ver on public.paquete_condiciones for select to authenticated using (app.sesion_valida());
create policy pc_alta on public.paquete_condiciones for insert to authenticated
  with check (app.puede_editar_paquete(paquete_id));
create policy pc_baja on public.paquete_condiciones for delete to authenticated
  using (app.puede_editar_paquete(paquete_id));
create trigger auditar after insert or delete on public.paquete_condiciones
  for each row execute function app.auditar();

-- Crea (paquete null) o reemplaza un paquete con sus condiciones en orden. Devuelve su id.
create function public.guardar_paquete_condiciones(paquete uuid, nombre text, condiciones jsonb) returns uuid
language plpgsql set search_path = '' as $$
declare
  c jsonb;
  n int := 0;
  id_paquete uuid := paquete;
begin
  if jsonb_typeof(condiciones) <> 'array' or jsonb_array_length(condiciones) = 0 then
    raise exception 'El paquete necesita al menos una condición' using errcode = '22023';
  end if;
  begin
    if id_paquete is null then
      insert into public.paquetes_condiciones (nombre) values (trim(guardar_paquete_condiciones.nombre))
      returning id into id_paquete;
    else
      update public.paquetes_condiciones p set nombre = trim(guardar_paquete_condiciones.nombre)
      where p.id = id_paquete and p.activo;
      if not found then
        raise exception 'Sólo quien creó el paquete o un administrador puede cambiarlo' using errcode = '42501';
      end if;
    end if;
  exception when unique_violation then
    raise exception 'Ya existe un paquete con ese nombre' using errcode = '23514';
  end;
  delete from public.paquete_condiciones where paquete_id = id_paquete;
  for c in select * from jsonb_array_elements(condiciones) loop
    n := n + 1;
    insert into public.paquete_condiciones (paquete_id, orden, condicion_id, contenido)
    values (id_paquete, n, nullif(c->>'condicion_id', '')::uuid, nullif(c->'contenido', 'null'::jsonb));
  end loop;
  return id_paquete;
end $$;
revoke execute on function public.guardar_paquete_condiciones(uuid, text, jsonb) from public, anon;
grant execute on function public.guardar_paquete_condiciones(uuid, text, jsonb) to authenticated;

-- Paquetes iniciales: uno por esquema con las condiciones actuales del catálogo (Rodrigo los ajusta después).
with nuevos as (
  insert into public.paquetes_condiciones (nombre, creado_por)
  select x.nombre, null from (values ('Adquisición'), ('Arrendamiento'), ('Crédito simple')) as x (nombre)
  where exists (select 1 from public.condiciones_comerciales where activa)
  returning id
)
insert into public.paquete_condiciones (paquete_id, orden, condicion_id)
select n.id, row_number() over (partition by n.id order by c.orden, c.creado_en), c.id
from nuevos n cross join public.condiciones_comerciales c
where c.activa;
