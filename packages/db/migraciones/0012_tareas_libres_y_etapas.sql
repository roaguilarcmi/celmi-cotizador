-- 0012 · Tareas como pipeline de trabajo y tareas libres (decisiones de Rodrigo, 2026-10-05).
--   · Etapas: Por hacer (`pendiente`) → En curso → En espera → Completada (y Cancelada, aparte).
--   · Una tarea puede no estar ligada a una oportunidad y puede no tener fecha.
--   · Con fecha, la hora es opcional (`sin_hora`): vence al final de ese día y sólo admite avisos de días antes.

alter type public.estado_tarea add value if not exists 'en_curso' after 'pendiente';
alter type public.estado_tarea add value if not exists 'en_espera' after 'en_curso';

-- ───────────── Tareas sin oportunidad y sin fecha ─────────────
alter table public.tareas alter column oportunidad_id drop not null;
alter table public.tareas drop constraint tarea_principal_con_fecha;
alter table public.tareas add column sin_hora boolean not null default false;
alter table public.tareas add constraint sin_hora_requiere_fecha check (not sin_hora or vence_en is not null);

drop policy tareas_alta on public.tareas;
create policy tareas_alta on public.tareas for insert to authenticated
  with check (
    app.sesion_valida()
    and responsable_id = auth.uid()
    and (oportunidad_id is null or app.puede_ver_oportunidad(oportunidad_id))
  );

-- Sin hora, el aviso sólo puede ser con días de anticipación (no hay «a la hora» ni «15 min antes»).
create or replace function app.calcular_aviso() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t record;
begin
  select tt.vence_en, tt.sin_hora into t from public.tareas tt where tt.id = new.tarea_id;
  if t.vence_en is null then
    raise exception 'Para programar avisos, la tarea necesita fecha' using errcode = '23514';
  end if;
  if t.sin_hora and new.minutos_antes % 1440 <> 0 then
    raise exception 'Sin hora, los avisos sólo pueden ser con días de anticipación' using errcode = '23514';
  end if;
  new.aviso_en := t.vence_en - make_interval(mins => new.minutos_antes);
  return new;
end $$;

-- ───────────── Borradores fuera de una oportunidad (desde «Mis tareas») ─────────────
alter table public.borradores alter column oportunidad_id drop not null;
alter table public.borradores drop constraint borradores_usuario_id_oportunidad_id_tipo_key;
alter table public.borradores add constraint borradores_unicos unique nulls not distinct (usuario_id, oportunidad_id, tipo);

drop policy borradores_propios on public.borradores;
create policy borradores_propios on public.borradores for all to authenticated
  using (usuario_id = auth.uid() and app.sesion_valida())
  with check (
    usuario_id = auth.uid()
    and app.sesion_valida()
    and (oportunidad_id is null or app.puede_ver_oportunidad(oportunidad_id))
  );
