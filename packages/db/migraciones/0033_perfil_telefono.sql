-- 0033 · Teléfono en el perfil (decisión de Rodrigo, 2026-10-13): la firma de la cotización es la del ejecutivo de la
-- cuenta, con su nombre completo, puesto, correo y teléfono. Lo edita el administrador de usuarios (RLS de 0002).
alter table public.perfiles
  add column telefono text not null default '' check (length(telefono) <= 40);
