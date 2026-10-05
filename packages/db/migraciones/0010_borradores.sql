-- 0010 · Fase 2: borradores de tareas y notas de seguimiento (petición de Rodrigo, 2026-10-05).
--
-- Al cerrar la ventana flotante con un registro a medias, se puede guardar como borrador para continuarlo después.
--   · Se guardan en la base (no en el navegador) para no dejar información confidencial en equipos compartidos.
--   · Son privados: sólo su autor los ve, incluso frente a administradores.
--   · Uno por persona, oportunidad y tipo; se borra al guardar el registro definitivo.
--   · Son apuntes de trabajo sin valor de evidencia: no se auditan.

create type public.tipo_borrador as enum ('tarea', 'nota');

create table public.borradores (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  oportunidad_id uuid not null references public.oportunidades (id) on delete cascade,
  tipo public.tipo_borrador not null,
  datos jsonb not null check (jsonb_typeof(datos) = 'object' and pg_column_size(datos) < 100000),
  actualizado_en timestamptz not null default now(),
  unique (usuario_id, oportunidad_id, tipo)
);

alter table public.borradores enable row level security;
revoke all on public.borradores from anon;
grant select, insert, update, delete on public.borradores to authenticated;

create policy borradores_propios on public.borradores for all to authenticated
  using (usuario_id = auth.uid() and app.sesion_valida())
  with check (usuario_id = auth.uid() and app.sesion_valida() and app.puede_ver_oportunidad(oportunidad_id));

create trigger actualizado_en before update on public.borradores
  for each row execute function app.fecha_actualizacion();
