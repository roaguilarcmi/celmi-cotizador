-- 0005 · Registro de accesos con responsable y permisos de la sesión para la interfaz.
-- Sin envío de correos (decisión 2026-10-03): el administrador genera enlaces de alta y recuperación, y cada
-- acción administrativa queda registrada con quién la hizo.

alter table public.accesos add column realizado_por uuid references auth.users (id) on delete set null;

alter table public.accesos drop constraint accesos_evento_check;
alter table public.accesos add constraint accesos_evento_check check (
  evento in (
    'inicio', 'cierre', 'fallido', 'mfa_inscrito', 'mfa_restablecido', 'recuperacion', 'bloqueo',
    'invitacion', 'desactivado', 'reactivado'
  )
);

-- Permisos de quien tiene la sesión (vacío si la sesión no es válida). Sólo sirve para mostrar u ocultar
-- opciones: la protección real la dan las reglas RLS.
create function public.mis_permisos() returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(rp.permiso_id order by rp.permiso_id), '{}')
  from public.perfiles p
  join public.rol_permisos rp on rp.rol_id = p.rol_id
  where p.id = auth.uid() and app.sesion_valida()
$$;
revoke execute on function public.mis_permisos() from public, anon;
grant execute on function public.mis_permisos() to authenticated;
