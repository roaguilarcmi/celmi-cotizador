-- 0003 · Auditoría (RFP §3.2 y §26): cada alta, cambio o baja de las tablas de negocio queda registrada con
-- usuario, fecha y hora, valor anterior y valor nuevo. Nadie puede modificarla ni borrarla.

create table public.auditoria (
  id bigint generated always as identity primary key,
  en timestamptz not null default now(),
  usuario_id uuid,
  tabla text not null,
  registro_id text not null,
  accion text not null check (accion in ('INSERT', 'UPDATE', 'DELETE')),
  antes jsonb,
  despues jsonb
);
create index on public.auditoria (tabla, registro_id);
create index on public.auditoria (en desc);
create index on public.auditoria (usuario_id, en desc);

create function app.auditar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  fila jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  if tg_op = 'UPDATE' and to_jsonb(old) = to_jsonb(new) then
    return null; -- sin cambios reales
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

do $$
declare t text;
begin
  foreach t in array array[
    'roles', 'rol_permisos', 'perfiles', 'configuracion',
    'monedas', 'unidades', 'mayoristas', 'marcas', 'estados_oportunidad', 'esquemas_adquisicion',
    'clientes', 'contactos', 'oportunidades', 'oportunidad_colaboradores',
    'cotizaciones', 'revisiones', 'propuestas', 'partidas',
    'partida_costos', 'partida_utilidad', 'partida_precios'
  ]
  loop
    execute format(
      'create trigger auditar after insert or update or delete on public.%I
         for each row execute function app.auditar()', t);
  end loop;
end $$;

-- Inalterable: ningún rol de la aplicación escribe directamente, y un disparador rechaza cambios y borrados
-- incluso con privilegios elevados.
alter table public.auditoria enable row level security;
revoke all on public.auditoria from anon;
revoke insert, update, delete, truncate on public.auditoria from authenticated;
grant select on public.auditoria to authenticated;
create policy auditoria_ver on public.auditoria for select to authenticated
  using (app.tiene_permiso('auditoria.ver'));

create function app.auditoria_inalterable() returns trigger
language plpgsql as $$
begin
  raise exception 'La auditoría no se puede modificar ni borrar' using errcode = '42501';
end $$;

create trigger inalterable before update or delete on public.auditoria
  for each row execute function app.auditoria_inalterable();
create trigger inalterable_truncate before truncate on public.auditoria
  for each statement execute function app.auditoria_inalterable();
