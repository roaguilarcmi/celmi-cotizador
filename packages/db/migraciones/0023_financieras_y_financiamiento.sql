-- 0023 · Financieras y opciones de financiamiento (decisiones de Rodrigo, 2026-10-07).
--   · Catálogo de financieras: nombre, razón social y una o más aseguradoras.
--   · Cada opción de financiamiento de una propuesta: financiera y aseguradora, # de cotización de la financiera, valor
--     de los equipos (precios autorizados, sin IVA), tipo de arrendamiento (VJM u operativo / Full PayOut o financiero;
--     no aplica en crédito simple), plazo, frecuencia de pago (mensual por omisión), valor residual (sólo Full PayOut,
--     en % o monto: se guardan ambos), gastos iniciales, pago de los equipos, pago del seguro, factor (opcional, sin
--     cálculos), tasa anual nominal (calculada) y vigencia de la cotización de la financiera. Todo sin IVA.
--   · El esquema del catálogo de esquemas ya no se usa en las opciones nuevas (queda en las anteriores).

create table public.financieras (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) between 1 and 120),
  razon_social text not null default '' check (length(razon_social) <= 200),
  aseguradoras text[] not null default '{}' check (cardinality(aseguradoras) <= 20),
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);
create unique index financieras_nombre on public.financieras (lower(nombre));

alter table public.financieras enable row level security;
revoke all on public.financieras from anon;
grant select, insert, update on public.financieras to authenticated;
create policy financieras_ver on public.financieras for select to authenticated using (app.sesion_valida());
create policy financieras_admin on public.financieras for all to authenticated
  using (app.tiene_permiso('catalogos.administrar')) with check (app.tiene_permiso('catalogos.administrar'));
create trigger auditar after insert or update or delete on public.financieras
  for each row execute function app.auditar();

-- ───────────── Opciones de financiamiento ─────────────
-- Ya no se exige un esquema por plazo: se quita la restricción única (su nombre automático quedó truncado).
do $$
declare c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'public.propuesta_financiamientos'::regclass and contype = 'u';
  if c is not null then
    execute format('alter table public.propuesta_financiamientos drop constraint %I', c);
  end if;
end $$;

alter table public.propuesta_financiamientos
  alter column esquema_id drop not null,
  add column financiera_id uuid references public.financieras (id),
  add column aseguradora text not null default '' check (length(aseguradora) <= 120),
  add column folio_financiera text not null default '' check (length(folio_financiera) <= 60),
  add column tipo_arrendamiento text check (tipo_arrendamiento in ('vjm', 'fpo')),
  add column frecuencia text not null default 'mensual'
    check (frecuencia in ('mensual', 'bimestral', 'trimestral', 'semestral', 'anual')),
  add column valor_equipos numeric(14, 2) check (valor_equipos >= 0),
  add column residual_capturado text check (residual_capturado in ('pct', 'monto')),
  add column residual_pct numeric(9, 4) check (residual_pct between 0 and 100),
  add column pago_seguro numeric(14, 2) check (pago_seguro >= 0),
  add column vigencia_financiera date,
  -- El residual sólo existe en Full PayOut; si existe, viene en % y en monto.
  add constraint residual_solo_fpo check (
    (tipo_arrendamiento = 'fpo' and residual_capturado is not null and residual_pct is not null
       and valor_residual is not null)
    or (residual_capturado is null and residual_pct is null)
  );
-- Columnas existentes que se reutilizan: mensualidad = pago de los equipos por periodo; valor_residual = residual en
-- monto; gastos_apertura = gastos iniciales; factor = opcional; tasa_interes = tasa anual nominal calculada.

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
      factor, tasa_interes, vigencia_financiera, orden)
    values (
      (f->>'propuesta_id')::uuid, nullif(f->>'financiera_id', '')::uuid, coalesce(f->>'aseguradora', ''),
      coalesce(f->>'folio_financiera', ''), nullif(f->>'tipo_arrendamiento', ''), (f->>'plazo_meses')::int,
      coalesce(nullif(f->>'frecuencia', ''), 'mensual'), nullif(f->>'valor_equipos', '')::numeric,
      nullif(f->>'residual_capturado', ''), nullif(f->>'residual_pct', '')::numeric,
      nullif(f->>'valor_residual', '')::numeric, nullif(f->>'gastos_iniciales', '')::numeric,
      nullif(f->>'pago', '')::numeric, nullif(f->>'pago_seguro', '')::numeric, nullif(f->>'factor', '')::numeric,
      nullif(f->>'tasa_interes', '')::numeric, nullif(f->>'vigencia_financiera', '')::date, n);
  end loop;
end $$;

-- La Rev nueva copia también los datos nuevos al autorizarse (0021).
create or replace function app.copiar_financiamiento() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.estado = 'autorizada' and old.estado is distinct from 'autorizada' and new.revision_anterior_id is not null
     and not exists (select 1 from public.propuesta_financiamientos f
                     join public.propuestas p on p.id = f.propuesta_id where p.revision_id = new.id) then
    insert into public.propuesta_financiamientos (
      propuesta_id, esquema_id, financiera_id, aseguradora, folio_financiera, tipo_arrendamiento, plazo_meses,
      frecuencia, valor_equipos, residual_capturado, residual_pct, valor_residual, gastos_apertura, mensualidad,
      pago_seguro, factor, tasa_interes, vigencia_financiera, orden)
    select nueva.id, f.esquema_id, f.financiera_id, f.aseguradora, f.folio_financiera, f.tipo_arrendamiento,
           f.plazo_meses, f.frecuencia, f.valor_equipos, f.residual_capturado, f.residual_pct, f.valor_residual,
           f.gastos_apertura, f.mensualidad, f.pago_seguro, f.factor, f.tasa_interes, f.vigencia_financiera, f.orden
    from public.propuestas nueva
    join public.propuesta_financiamientos f on f.propuesta_id = nueva.propuesta_origen_id
    where nueva.revision_id = new.id and not nueva.es_adicional;
  end if;
  return null;
end $$;
