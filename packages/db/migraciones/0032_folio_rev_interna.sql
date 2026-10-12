-- 0032 · Folio por emisión (decisión de Rodrigo, 2026-10-12).
--   · La cancelación es del folio exacto: «…1271» cancelado no se reactiva con una Rev visible («…1271 Rev B» es un
--     folio distinto); sólo una Rev interna, que conserva exactamente el folio de la emisión anterior (con su
--     « Rev A» si lo tenía), lo vuelve a usar.

create or replace function public.emitir_revision(revision uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  r public.revisiones;
  anterior public.revisiones;
  base text;
  folio_final text;
  anio int := extract(year from now() at time zone 'America/Mexico_City')::int;
begin
  select * into r from public.revisiones x where x.id = revision for update;
  if r.id is null or not app.sesion_valida() or not app.tiene_permiso('pdf.emitir')
     or not app.puede_ver_oportunidad(app.oportunidad_de_cotizacion(r.cotizacion_id)) then
    raise exception 'No tienes acceso para emitir esta cotización' using errcode = '42501';
  end if;
  if r.estado <> 'autorizada' then
    raise exception 'Sólo se emite una revisión autorizada' using errcode = '23514';
  end if;
  if exists (select 1 from public.revisiones x where x.cotizacion_id = r.cotizacion_id and x.numero > r.numero) then
    raise exception 'Hay una revisión más reciente; emite la vigente' using errcode = '23514';
  end if;
  perform 1 from public.cotizaciones c where c.id = r.cotizacion_id for update;

  -- Última emisión de la cotización (su folio exacto y su folio base).
  select * into anterior from public.revisiones x
  where x.cotizacion_id = r.cotizacion_id and x.folio is not null
  order by x.numero desc limit 1;

  if r.numero = 0 or r.visibilidad = 'nuevo_folio' or anterior.id is null then
    base := app.siguiente_folio(anio);
    folio_final := case when r.numero > 0 and r.visibilidad = 'visible'
                        then base || ' Rev ' || app.sufijo_revision(r.numero) else base end;
  elsif r.visibilidad = 'interna' then
    base := anterior.folio_base;
    folio_final := anterior.folio;
  else
    base := anterior.folio_base;
    folio_final := base || ' Rev ' || app.sufijo_revision(r.numero);
  end if;

  perform set_config('app.emision', '1', true);
  update public.revisiones
  set estado = 'emitida', folio = folio_final, folio_base = base, emitida_por = auth.uid(), emitida_en = now()
  where id = revision;
  perform set_config('app.emision', '', true);

  update public.cotizaciones
  set folio = base,
      folio_anio = substring(base from '-(\d{4})\d+$')::int,
      folio_consecutivo = substring(base from '-\d{4}(\d+)$')::int
  where id = r.cotizacion_id and folio is distinct from base;
  return folio_final;
end $$;
