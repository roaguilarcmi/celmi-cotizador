-- 0028 · No se envía a autorización con precios de mayorista vencidos (decisión de Rodrigo, 2026-10-09).
-- La vigencia del costo de cada partida es opcional, pero si ya pasó (calendario de la Ciudad de México) la revisión
-- no sale de borrador hasta actualizar el costo o su vigencia. La pantalla también lo impide al capturar.

create function app.precios_vigentes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  vencidas int;
begin
  if new.estado = 'pendiente_autorizacion' and old.estado is distinct from new.estado then
    select count(*) into vencidas
    from public.partidas pa
    join public.propuestas pr on pr.id = pa.propuesta_id
    join public.partida_costos c on c.partida_id = pa.id
    where pr.revision_id = new.id
      and c.vigencia < (now() at time zone 'America/Mexico_City')::date;
    if vencidas > 0 then
      raise exception 'Hay % partida(s) con el precio del mayorista vencido; actualiza el costo o su vigencia', vencidas
        using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

create trigger precios_vigentes before update on public.revisiones
  for each row execute function app.precios_vigentes();
