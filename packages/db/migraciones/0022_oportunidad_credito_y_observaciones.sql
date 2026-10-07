-- 0022 · Ajustes a la oportunidad (decisiones de Rodrigo, 2026-10-07).
--   · Tipo general: además de Adquisición y Arrendamiento, «Crédito simple».
--   · Observaciones internas con formato (JSON validado por la aplicación, igual que tareas y seguimiento); el texto
--     plano se conserva en observaciones_internas para búsqueda y respaldo.

alter table public.oportunidades drop constraint oportunidades_tipo_check;
alter table public.oportunidades
  add constraint oportunidades_tipo_check check (tipo in ('adquisicion', 'arrendamiento', 'credito_simple'));

alter table public.oportunidades add column observaciones_contenido jsonb
  check (observaciones_contenido is null or jsonb_typeof(observaciones_contenido) = 'object');
