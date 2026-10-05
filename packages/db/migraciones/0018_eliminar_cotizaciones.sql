-- 0018 · Eliminar cotizaciones (decisión de Rodrigo, 2026-10-05).
--   · Se puede eliminar una cotización mientras ninguna de sus revisiones haya tenido precios autorizados
--     (ni esté autorizada o emitida, ni tenga folio). Después, ya no.
--   · La elimina quien puede editar la oportunidad. Se borra con sus revisiones, propuestas y partidas (cascada) y la
--     auditoría conserva el registro de lo eliminado.

create function app.cotizacion_eliminable(cotizacion uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.revisiones r
    where r.cotizacion_id = cotizacion
      and (r.estado in ('autorizada', 'emitida') or r.autorizada_en is not null)
  )
  and coalesce((select c.folio is null from public.cotizaciones c where c.id = cotizacion), false)
$$;

grant delete on public.cotizaciones to authenticated;

create policy cotizaciones_baja on public.cotizaciones for delete to authenticated
  using (app.puede_editar_oportunidad(oportunidad_id) and app.cotizacion_eliminable(id));
