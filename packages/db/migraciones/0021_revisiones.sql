-- 0021 · Fase 3D: revisiones (decisiones de Rodrigo, 2026-10-06).
--   · Cada propuesta y partida copiada a una Rev nueva recuerda de cuál viene (propuesta_origen_id, partida_origen_id):
--     así se compara Rev contra Rev y se precarga la utilidad anterior.
--   · La utilidad autorizada en la Rev anterior se precarga en la corrida (lo hace la aplicación; se vuelve a autorizar).
--   · El financiamiento de la Rev anterior se copia al autorizar la nueva (antes no se puede capturar), si la nueva aún
--     no tiene; el ejecutivo lo ajusta después.
--   · Una Rev que nunca se autorizó (borrador o rechazada, no la original y la más reciente) se puede descartar.

alter table public.propuestas
  add column propuesta_origen_id uuid references public.propuestas (id) on delete set null;
alter table public.partidas
  add column partida_origen_id uuid references public.partidas (id) on delete set null;
create index on public.propuestas (propuesta_origen_id);
create index on public.partidas (partida_origen_id);

-- La copia la hace sólo crear_revision: la aplicación no puede inventar un origen.
create function app.origen_partida_fijo() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.partida_origen_id is distinct from old.partida_origen_id then
    raise exception 'El origen de una partida no se modifica' using errcode = '42501';
  end if;
  return new;
end $$;
create function app.origen_propuesta_fijo() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.propuesta_origen_id is distinct from old.propuesta_origen_id then
    raise exception 'El origen de una propuesta no se modifica' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger origen_fijo before update on public.partidas
  for each row execute function app.origen_partida_fijo();
create trigger origen_fijo before update on public.propuestas
  for each row execute function app.origen_propuesta_fijo();

-- ───────────── Nueva revisión: igual que 0016, recordando el origen ─────────────
create or replace function public.crear_revision(cotizacion uuid, motivo public.motivo_revision) returns uuid
language plpgsql set search_path = '' as $$
declare
  anterior public.revisiones;
  nueva uuid;
  p record;
  nueva_propuesta uuid;
  pa record;
  nueva_partida uuid;
  mapa jsonb := '{}';
begin
  if motivo = 'inicial' then
    raise exception 'Una revisión nueva es por solicitud del cliente o por mejora de precio' using errcode = '22023';
  end if;
  select * into anterior from public.revisiones r where r.cotizacion_id = cotizacion order by r.numero desc limit 1;
  if anterior.id is null then
    raise exception 'La cotización no existe o no tienes acceso' using errcode = '42501';
  end if;
  if anterior.estado not in ('autorizada', 'emitida') then
    raise exception 'Sólo se crea una revisión nueva a partir de una autorizada' using errcode = '23514';
  end if;

  insert into public.revisiones (cotizacion_id, numero, revision_anterior_id, motivo, estado, creado_por,
                                 vigencia_hasta, condiciones)
  values (cotizacion, anterior.numero + 1, anterior.id, motivo, 'borrador', auth.uid(),
          anterior.vigencia_hasta, anterior.condiciones)
  returning id into nueva;

  for p in select * from public.propuestas pr where pr.revision_id = anterior.id order by pr.orden loop
    insert into public.propuestas (revision_id, orden, nombre, tipo, modalidad, es_adicional, propuesta_origen_id)
    values (nueva, p.orden, p.nombre, p.tipo, p.modalidad, p.es_adicional, p.id)
    returning id into nueva_propuesta;
    -- Primero las partidas y después sus adicionales (el adicional necesita el id nuevo de su partida).
    for pa in select * from public.partidas x where x.propuesta_id = p.id
              order by (x.partida_padre_id is not null), x.orden loop
      insert into public.partidas (propuesta_id, partida_padre_id, orden, sku, marca_id, descripcion,
                                   descripcion_contenido, entrega, unidad_id, cantidad, oculta_al_cliente, se_suma,
                                   presentacion, partida_origen_id)
      values (nueva_propuesta, (mapa->>(pa.partida_padre_id::text))::uuid, pa.orden, pa.sku, pa.marca_id,
              pa.descripcion, pa.descripcion_contenido, pa.entrega, pa.unidad_id, pa.cantidad, pa.oculta_al_cliente,
              pa.se_suma, pa.presentacion, pa.id)
      returning id into nueva_partida;
      mapa := mapa || jsonb_build_object(pa.id::text, nueva_partida);
      insert into public.partida_costos (partida_id, mayorista_id, moneda, costo_unitario, costo_anterior, tipo_cambio, vigencia)
      select nueva_partida, c.mayorista_id, c.moneda, c.costo_unitario,
             -- Mejora de precio: el costo vigente pasa a ser el «Precio anterior».
             case when motivo = 'mejora_precio' then c.costo_unitario else c.costo_anterior end,
             c.tipo_cambio, c.vigencia
      from public.partida_costos c where c.partida_id = pa.id;
    end loop;
  end loop;

  insert into public.partida_prorrateos (partida_id, destino_id)
  select (mapa->>(x.partida_id::text))::uuid, (mapa->>(x.destino_id::text))::uuid
  from public.partida_prorrateos x
  join public.partidas origen on origen.id = x.partida_id
  join public.propuestas prop on prop.id = origen.propuesta_id
  where prop.revision_id = anterior.id;
  return nueva;
end $$;

-- guardar_partidas reescribe propuestas y partidas: conserva el origen de las que ya existían (no lo recibe).
-- (Las partidas nuevas capturadas en la Rev no tienen origen: en la comparación aparecen como «nuevas».)

-- ───────────── Financiamiento: se copia al autorizar la Rev nueva ─────────────
-- security definer: quien autoriza puede no ser quien captura el financiamiento; se copia tal cual.
create function app.copiar_financiamiento() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.estado = 'autorizada' and old.estado is distinct from 'autorizada' and new.revision_anterior_id is not null
     and not exists (select 1 from public.propuesta_financiamientos f
                     join public.propuestas p on p.id = f.propuesta_id where p.revision_id = new.id) then
    insert into public.propuesta_financiamientos (propuesta_id, esquema_id, plazo_meses, mensualidad, valor_residual,
                                                  factor, tasa_interes, gastos_apertura, orden)
    select nueva.id, f.esquema_id, f.plazo_meses, f.mensualidad, f.valor_residual, f.factor, f.tasa_interes,
           f.gastos_apertura, f.orden
    from public.propuestas nueva
    join public.propuesta_financiamientos f on f.propuesta_id = nueva.propuesta_origen_id
    where nueva.revision_id = new.id and not nueva.es_adicional;
  end if;
  return null;
end $$;
create trigger copiar_financiamiento after update on public.revisiones
  for each row execute function app.copiar_financiamiento();

-- ───────────── Descartar una Rev que nunca se autorizó ─────────────
create function app.revision_descartable(revision uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select r.numero > 0 and r.estado in ('borrador', 'rechazada') and r.autorizada_en is null
           and r.numero = (select max(x.numero) from public.revisiones x where x.cotizacion_id = r.cotizacion_id)
    from public.revisiones r where r.id = revision), false)
$$;

grant delete on public.revisiones to authenticated;
create policy revisiones_baja on public.revisiones for delete to authenticated
  using (app.puede_editar_oportunidad(app.oportunidad_de_cotizacion(cotizacion_id)) and app.revision_descartable(id));
