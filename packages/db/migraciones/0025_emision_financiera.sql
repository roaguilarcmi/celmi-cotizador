-- 0025 · Fecha de emisión de la cotización de la financiera (decisión de Rodrigo, 2026-10-07). Sirve de base a los
-- atajos de vigencia (15 días, 30 días, fin de mes); la vigencia no puede ser anterior a la emisión.

alter table public.propuesta_financiamientos
  add column fecha_emision_financiera date,
  add constraint vigencia_despues_de_emision check (
    vigencia_financiera is null or fecha_emision_financiera is null or vigencia_financiera >= fecha_emision_financiera
  );

create or replace function public.guardar_financiamiento(revision uuid, filas jsonb) returns void
language plpgsql set search_path = '' as $$
declare
  f jsonb;
  n int := 0;
begin
  if jsonb_typeof(filas) <> 'array' then
    raise exception 'Formato no válido' using errcode = '22023';
  end if;
  if not coalesce((select r.estado = 'autorizada' from public.revisiones r where r.id = revision), false) then
    raise exception 'El financiamiento se captura cuando los precios ya están autorizados' using errcode = '42501';
  end if;
  delete from public.propuesta_financiamientos x using public.propuestas p
  where x.propuesta_id = p.id and p.revision_id = revision;
  for f in select * from jsonb_array_elements(filas) loop
    n := n + 1;
    if app.revision_de_propuesta((f->>'propuesta_id')::uuid) is distinct from revision then
      raise exception 'Propuesta no válida' using errcode = '42501';
    end if;
    insert into public.propuesta_financiamientos (
      propuesta_id, financiera_id, aseguradora, folio_financiera, tipo_arrendamiento, plazo_meses, frecuencia,
      valor_equipos, residual_capturado, residual_pct, valor_residual, gastos_apertura, mensualidad, pago_seguro,
      factor, tasa_interes, vigencia_financiera, fecha_emision_financiera, orden)
    values (
      (f->>'propuesta_id')::uuid, nullif(f->>'financiera_id', '')::uuid, coalesce(f->>'aseguradora', ''),
      coalesce(f->>'folio_financiera', ''), nullif(f->>'tipo_arrendamiento', ''), (f->>'plazo_meses')::int,
      coalesce(nullif(f->>'frecuencia', ''), 'mensual'), nullif(f->>'valor_equipos', '')::numeric,
      nullif(f->>'residual_capturado', ''), nullif(f->>'residual_pct', '')::numeric,
      nullif(f->>'valor_residual', '')::numeric, nullif(f->>'gastos_iniciales', '')::numeric,
      nullif(f->>'pago', '')::numeric, nullif(f->>'pago_seguro', '')::numeric, nullif(f->>'factor', '')::numeric,
      nullif(f->>'tasa_interes', '')::numeric, nullif(f->>'vigencia_financiera', '')::date,
      nullif(f->>'fecha_emision_financiera', '')::date, n);
  end loop;
end $$;

create or replace function app.copiar_financiamiento() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.estado = 'autorizada' and old.estado is distinct from 'autorizada' and new.revision_anterior_id is not null
     and not exists (select 1 from public.propuesta_financiamientos f
                     join public.propuestas p on p.id = f.propuesta_id where p.revision_id = new.id) then
    insert into public.propuesta_financiamientos (
      propuesta_id, esquema_id, financiera_id, aseguradora, folio_financiera, tipo_arrendamiento, plazo_meses,
      frecuencia, valor_equipos, residual_capturado, residual_pct, valor_residual, gastos_apertura, mensualidad,
      pago_seguro, factor, tasa_interes, vigencia_financiera, fecha_emision_financiera, orden)
    select nueva.id, f.esquema_id, f.financiera_id, f.aseguradora, f.folio_financiera, f.tipo_arrendamiento,
           f.plazo_meses, f.frecuencia, f.valor_equipos, f.residual_capturado, f.residual_pct, f.valor_residual,
           f.gastos_apertura, f.mensualidad, f.pago_seguro, f.factor, f.tasa_interes, f.vigencia_financiera,
           f.fecha_emision_financiera, f.orden
    from public.propuestas nueva
    join public.propuesta_financiamientos f on f.propuesta_id = nueva.propuesta_origen_id
    where nueva.revision_id = new.id and not nueva.es_adicional;
  end if;
  return null;
end $$;
