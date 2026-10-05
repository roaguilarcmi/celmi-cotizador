-- 0007 · Tareas con aviso programado (decisión 2026-10-05).
--   · Cada quien crea sus propias tareas: son personales y nadie más las ve, ni los administradores.
--   · La anticipación del aviso se elige al crearla (a la hora, 15 min, 1 h, 1 día antes o sin aviso).
--   · Hoy el aviso se muestra dentro de la aplicación (campana y notificación del sistema con la app abierta);
--     `aviso_en` queda listo para notificaciones push cuando existan (app Android o web publicada).

create type public.estado_tarea as enum ('pendiente', 'completada', 'cancelada');

create table public.tareas (
  id uuid primary key default gen_random_uuid(),
  oportunidad_id uuid not null references public.oportunidades (id) on delete cascade,
  responsable_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  titulo text not null check (length(trim(titulo)) between 2 and 200),
  descripcion text not null default '' check (length(descripcion) <= 2000),
  vence_en timestamptz not null,
  -- Momento del aviso (nulo = sin aviso). Nunca después del vencimiento.
  aviso_en timestamptz check (aviso_en is null or aviso_en <= vence_en),
  estado public.estado_tarea not null default 'pendiente',
  completada_en timestamptz,
  creado_en timestamptz not null default now()
);
create index on public.tareas (responsable_id, estado, vence_en);
create index on public.tareas (oportunidad_id);

alter table public.tareas enable row level security;
revoke all on public.tareas from anon;
-- Sin DELETE: una tarea se cancela, no se borra (queda en la auditoría).
grant select, insert, update on public.tareas to authenticated;

create policy tareas_ver on public.tareas for select to authenticated
  using (app.sesion_valida() and responsable_id = auth.uid());

create policy tareas_alta on public.tareas for insert to authenticated
  with check (
    app.sesion_valida()
    and responsable_id = auth.uid()
    and app.puede_ver_oportunidad(oportunidad_id)
  );

create policy tareas_editar on public.tareas for update to authenticated
  using (app.sesion_valida() and responsable_id = auth.uid())
  with check (app.sesion_valida() and responsable_id = auth.uid());

-- No se cambia de dueño ni de oportunidad; la fecha de completado la pone la base.
create function app.reglas_tarea() returns trigger
language plpgsql as $$
begin
  if new.responsable_id is distinct from old.responsable_id or new.oportunidad_id is distinct from old.oportunidad_id then
    raise exception 'Una tarea no cambia de responsable ni de oportunidad' using errcode = '42501';
  end if;
  new.completada_en := case when new.estado = 'completada' then coalesce(old.completada_en, now()) end;
  return new;
end $$;

create trigger reglas before update on public.tareas for each row execute function app.reglas_tarea();
create trigger auditar after insert or update on public.tareas for each row execute function app.auditar();
