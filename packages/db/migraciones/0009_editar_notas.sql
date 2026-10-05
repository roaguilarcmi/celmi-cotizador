-- 0009 · Fase 2: editar notas de seguimiento (petición de Rodrigo, 2026-10-05).
--
-- La bitácora sigue siendo evidencia, así que la edición es acotada:
--   · Sólo el autor edita sus propias notas, llamadas, visitas o correos, y sólo mientras participa en la oportunidad.
--   · Los cambios de estado (registrados por el sistema) no se editan. Nada se borra.
--   · Sólo cambian tipo, texto y contenido (privilegio por columna): nunca autor, oportunidad ni fecha.
--   · Cada edición marca `editado_en` y la auditoría inalterable guarda la versión anterior y la nueva.

alter table public.seguimiento add column editado_en timestamptz;

grant update (tipo, texto, contenido) on public.seguimiento to authenticated;

create policy seguimiento_editar on public.seguimiento for update to authenticated
  using (autor_id = auth.uid() and tipo <> 'cambio_estado' and app.puede_editar_oportunidad(oportunidad_id))
  with check (autor_id = auth.uid() and tipo <> 'cambio_estado' and app.puede_editar_oportunidad(oportunidad_id));

create function app.marcar_edicion() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.editado_en := now();
  return new;
end;
$$;

create trigger marcar_edicion before update on public.seguimiento
  for each row execute function app.marcar_edicion();

drop trigger auditar on public.seguimiento;
create trigger auditar after insert or update on public.seguimiento
  for each row execute function app.auditar();
