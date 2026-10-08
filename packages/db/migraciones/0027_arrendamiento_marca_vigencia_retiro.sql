-- 0027 · Ajustes previos a la Fase 4 (decisiones de Rodrigo, 2026-10-07).
--   · Mayoristas: se indica si se trabajan arrendamientos con cada uno; sólo esos pueden ser el mayorista del
--     arrendamiento de una cotización.
--   · Marca: deja de ser catálogo; se escribe en cada partida (el catálogo anterior queda sólo como historial).
--   · Vigencia de la cotización: la fija quien autoriza en la corrida (ya no en Condiciones); es obligatoria para
--     autorizar, a las 14:00 h y nunca en sábado ni domingo.
--   · Retirar para corregir: quien autoriza regresa la revisión a borrador con un motivo, y se avisa a quien la
--     capturó y al ejecutivo de la oportunidad (tabla de avisos dentro de la app).

-- ───────────── Mayoristas con arrendamiento ─────────────
alter table public.mayoristas add column trabaja_arrendamiento boolean not null default false;
-- Los que ya se usan como mayorista de arrendamiento lo conservan.
update public.mayoristas set trabaja_arrendamiento = true
where id in (select r.mayorista_arrendamiento_id from public.revisiones r where r.mayorista_arrendamiento_id is not null);

create or replace function app.reglas_datos_revision() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.esquema is distinct from old.esquema
      or new.mayorista_arrendamiento_id is distinct from old.mayorista_arrendamiento_id)
     and old.estado <> 'borrador' and old.estado = new.estado then
    raise exception 'El esquema y el mayorista del arrendamiento se cambian sólo en borrador' using errcode = '42501';
  end if;
  if (new.anticipo_pct is distinct from old.anticipo_pct or new.transaccion_pct is distinct from old.transaccion_pct
      or new.transaccion_alcance is distinct from old.transaccion_alcance)
     and not app.tiene_permiso('utilidad.autorizar') and old.estado = new.estado then
    raise exception 'El anticipo y la transaccionalidad los define quien autoriza' using errcode = '42501';
  end if;
  if new.estado = 'pendiente_autorizacion' and old.estado is distinct from new.estado
     and new.esquema = 'arrendamiento' then
    if new.mayorista_arrendamiento_id is null then
      raise exception 'Indica con qué mayorista se trabaja el arrendamiento' using errcode = '23514';
    end if;
    if not coalesce((select m.trabaja_arrendamiento from public.mayoristas m
                     where m.id = new.mayorista_arrendamiento_id), false) then
      raise exception 'Con ese mayorista no se trabajan arrendamientos (revisa el catálogo de mayoristas)'
        using errcode = '23514';
    end if;
  end if;
  -- Fuera de arrendamiento no hay mayorista de arrendamiento.
  if new.esquema <> 'arrendamiento' then
    new.mayorista_arrendamiento_id := null;
  end if;
  return new;
end $$;

-- ───────────── Marca escrita en la partida ─────────────
alter table public.partidas add column marca text not null default '' check (length(marca) <= 80);
update public.partidas pa set marca = m.nombre from public.marcas m where m.id = pa.marca_id;

-- Una revisión nueva copia la marca de la partida de origen (crear_revision no la conoce).
create function app.copiar_marca() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.partida_origen_id is not null and new.marca = '' then
    select o.marca into new.marca from public.partidas o where o.id = new.partida_origen_id;
    new.marca := coalesce(new.marca, '');
  end if;
  return new;
end $$;
create trigger copiar_marca before insert on public.partidas
  for each row execute function app.copiar_marca();

create or replace function app.guardar_una_partida(revision uuid, id_propuesta uuid, padre uuid, orden int, pa jsonb)
returns uuid
language plpgsql set search_path = '' as $$
declare
  id_partida uuid;
  c jsonb := pa->'costo';
  la_marca text := left(trim(coalesce(pa->>'marca', '')), 80);
begin
  if pa->>'id' <> '' then
    id_partida := (pa->>'id')::uuid;
    update public.partidas set
      propuesta_id = id_propuesta, partida_padre_id = padre, orden = guardar_una_partida.orden,
      sku = coalesce(pa->>'sku', ''), marca = la_marca, descripcion = pa->>'descripcion',
      descripcion_contenido = case when jsonb_typeof(pa->'descripcion_contenido') = 'object' then pa->'descripcion_contenido' end,
      entrega = coalesce(pa->>'entrega', ''), unidad_id = nullif(pa->>'unidad_id', ''),
      cantidad = (pa->>'cantidad')::int, se_suma = coalesce((pa->>'se_suma')::boolean, false),
      presentacion = coalesce(nullif(pa->>'presentacion', ''), 'linea'),
      oculta_al_cliente = coalesce(nullif(pa->>'presentacion', ''), 'linea') <> 'linea'
    where id = id_partida
      and propuesta_id in (select x.id from public.propuestas x where x.revision_id = revision);
    if not found then raise exception 'Partida no válida' using errcode = '42501'; end if;
  else
    insert into public.partidas (propuesta_id, partida_padre_id, orden, sku, marca, descripcion, descripcion_contenido,
                                 entrega, unidad_id, cantidad, se_suma, presentacion, oculta_al_cliente)
    values (id_propuesta, padre, guardar_una_partida.orden, coalesce(pa->>'sku', ''), la_marca,
            pa->>'descripcion',
            case when jsonb_typeof(pa->'descripcion_contenido') = 'object' then pa->'descripcion_contenido' end,
            coalesce(pa->>'entrega', ''), nullif(pa->>'unidad_id', ''), (pa->>'cantidad')::int,
            coalesce((pa->>'se_suma')::boolean, false), coalesce(nullif(pa->>'presentacion', ''), 'linea'),
            coalesce(nullif(pa->>'presentacion', ''), 'linea') <> 'linea')
    returning id into id_partida;
  end if;

  -- El T.C. ya no se captura en la partida: lo fija quien autoriza (revision_tipos_cambio). Queda en 1.
  if c is null or jsonb_typeof(c) <> 'object' then
    delete from public.partida_costos where partida_id = id_partida;
  else
    insert into public.partida_costos (partida_id, mayorista_id, moneda, costo_unitario, tipo_cambio, vigencia)
    values (id_partida, nullif(c->>'mayorista_id', '')::uuid, coalesce(nullif(c->>'moneda', ''), 'MXN'),
            (c->>'costo_unitario')::numeric, 1, nullif(c->>'vigencia', '')::date)
    on conflict (partida_id) do update set
      mayorista_id = excluded.mayorista_id, moneda = excluded.moneda, costo_unitario = excluded.costo_unitario,
      tipo_cambio = 1, vigencia = excluded.vigencia;
  end if;
  return id_partida;
end $$;

-- Sin T.C. autorizado, una moneda extranjera no tiene T.C. (ya no se usa el capturado).
create or replace function app.tipo_cambio_de_partida(partida uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select case when c.moneda = 'MXN' then 1
              else (select t.tipo_cambio from public.revision_tipos_cambio t
                    where t.revision_id = app.revision_de_partida(partida) and t.moneda = c.moneda) end
  from public.partida_costos c where c.partida_id = partida
$$;

-- ───────────── Retiro para corregir ─────────────
alter table public.revisiones
  add column motivo_retiro text not null default '' check (length(motivo_retiro) <= 2000),
  add column retirada_por uuid references public.perfiles (id),
  add column retirada_en timestamptz;

-- ───────────── Reglas de la revisión: vigencia en la autorización ─────────────
create or replace function app.reglas_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  sin_costo int;
  sin_precio int;
  partidas int;
begin
  if new.cotizacion_id is distinct from old.cotizacion_id or new.numero is distinct from old.numero
     or new.revision_anterior_id is distinct from old.revision_anterior_id or new.motivo is distinct from old.motivo then
    raise exception 'Una revisión no cambia de cotización, número ni motivo' using errcode = '42501';
  end if;
  if new.estado = old.estado then
    -- Las condiciones se editan en borrador; la vigencia la fija quien autoriza mientras espera autorización.
    if old.estado <> 'borrador' and new.condiciones is distinct from old.condiciones then
      raise exception 'Sólo una revisión en borrador cambia sus condiciones' using errcode = '42501';
    end if;
    if new.vigencia_hasta is distinct from old.vigencia_hasta
       and not (old.estado = 'pendiente_autorizacion' and app.tiene_permiso('utilidad.autorizar')) then
      raise exception 'La vigencia la fija quien autoriza, en la corrida de precios' using errcode = '42501';
    end if;
    return new;
  end if;

  select count(*), count(*) filter (where c.partida_id is null), count(*) filter (where p.partida_id is null)
    into partidas, sin_costo, sin_precio
  from public.partidas pa
  join public.propuestas pr on pr.id = pa.propuesta_id
  left join public.partida_costos c on c.partida_id = pa.id
  left join public.partida_precios p on p.partida_id = pa.id
  where pr.revision_id = new.id;

  case
    when old.estado in ('borrador', 'rechazada') and new.estado = 'pendiente_autorizacion' then
      if partidas = 0 then
        raise exception 'Agrega al menos una partida antes de enviarla a autorización' using errcode = '23514';
      end if;
      if sin_costo > 0 then
        raise exception 'Faltan costos en % partida(s)', sin_costo using errcode = '23514';
      end if;
      perform app.descartar_precios(new.id);
      new.enviada_en := now();
      new.autorizada_por := null;
      new.autorizada_en := null;
    when old.estado in ('pendiente_autorizacion', 'rechazada') and new.estado = 'borrador' then
      new.enviada_en := null;
    when old.estado = 'pendiente_autorizacion' and new.estado = 'autorizada' then
      if sin_precio > 0 then
        raise exception 'Faltan precios en % partida(s)', sin_precio using errcode = '23514';
      end if;
      if new.vigencia_hasta is null then
        raise exception 'Indica la vigencia de la cotización' using errcode = '23514';
      end if;
      new.autorizada_por := auth.uid();
      new.autorizada_en := now();
    when old.estado = 'pendiente_autorizacion' and new.estado = 'rechazada' then
      if length(trim(new.comentario_autorizacion)) = 0 then
        raise exception 'Indica el motivo del rechazo' using errcode = '23514';
      end if;
    else
      -- La emisión (autorizada → emitida, con folio) llega en la Fase 4.
      raise exception 'Cambio de estado no permitido: % → %', old.estado, new.estado using errcode = '42501';
  end case;
  return new;
end $$;

-- La vigencia viaja con los demás datos de la autorización (guardar avance y autorizar).
create or replace function app.guardar_datos_autorizacion(revision uuid, datos jsonb) returns void
language plpgsql set search_path = '' as $$
declare
  esq text;
  anticipo numeric := nullif(datos->>'anticipo_pct', '')::numeric;
  transaccion numeric := nullif(datos->>'transaccion_pct', '')::numeric;
  alcance text := nullif(datos->>'transaccion_alcance', '');
  vigencia timestamptz := nullif(datos->>'vigencia_hasta', '')::timestamptz;
begin
  select r.esquema into esq from public.revisiones r where r.id = revision;
  if anticipo is not null and esq <> 'adquisicion' then
    raise exception 'El anticipo sólo aplica en adquisición' using errcode = '23514';
  end if;
  if transaccion is not null and esq <> 'arrendamiento' then
    raise exception 'La transaccionalidad sólo aplica en arrendamiento' using errcode = '23514';
  end if;
  if transaccion is not null and transaccion > 0 and alcance is null then
    raise exception 'Indica si la transaccionalidad va en todas las partidas o sólo en las de otro proveedor'
      using errcode = '23514';
  end if;
  if vigencia is not null and extract(isodow from vigencia at time zone 'America/Mexico_City') in (6, 7) then
    raise exception 'La vigencia no puede caer en sábado ni domingo' using errcode = '23514';
  end if;
  update public.revisiones
  set anticipo_pct = anticipo, transaccion_pct = transaccion,
      transaccion_alcance = case when coalesce(transaccion, 0) > 0 then alcance end,
      vigencia_hasta = case when datos ? 'vigencia_hasta' then vigencia else vigencia_hasta end
  where id = revision;
end $$;

-- ───────────── Avisos dentro de la app ─────────────
create table public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  destinatario_id uuid not null references public.perfiles (id),
  tipo text not null check (tipo in ('revision_retirada')),
  titulo text not null check (length(titulo) <= 200),
  cuerpo text not null default '' check (length(cuerpo) <= 2000),
  enlace text not null default '' check (enlace = '' or enlace like '/%'),
  creado_por uuid references public.perfiles (id),
  creado_en timestamptz not null default now(),
  leida_en timestamptz
);
create index notificaciones_destinatario on public.notificaciones (destinatario_id, creado_en desc);

alter table public.notificaciones enable row level security;
revoke all on public.notificaciones from anon, authenticated;
-- Sólo se leen y se marcan como leídas; las crean funciones de la base.
grant select on public.notificaciones to authenticated;
grant update (leida_en) on public.notificaciones to authenticated;
create policy notificaciones_ver on public.notificaciones for select to authenticated
  using (app.sesion_valida() and destinatario_id = auth.uid());
create policy notificaciones_leer on public.notificaciones for update to authenticated
  using (app.sesion_valida() and destinatario_id = auth.uid())
  with check (app.sesion_valida() and destinatario_id = auth.uid());

create function public.retirar_revision(revision uuid, motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.revisiones;
  ejecutivo uuid;
  oportunidad uuid;
  nombre_oportunidad text;
  quien text;
begin
  if not app.sesion_valida() or not app.tiene_permiso('utilidad.autorizar') then
    raise exception 'Sólo quien autoriza puede retirar una cotización para corregirla' using errcode = '42501';
  end if;
  if length(trim(coalesce(retirar_revision.motivo, ''))) < 5 then
    raise exception 'Explica qué hay que corregir' using errcode = '23514';
  end if;
  select * into r from public.revisiones x where x.id = revision for update;
  if r.id is null or r.estado <> 'pendiente_autorizacion' then
    raise exception 'Sólo se retira una revisión que espera autorización' using errcode = '23514';
  end if;

  update public.revisiones
  set estado = 'borrador', motivo_retiro = left(trim(retirar_revision.motivo), 2000), retirada_por = auth.uid(), retirada_en = now()
  where id = revision;

  select o.ejecutivo_id, o.id, o.nombre into ejecutivo, oportunidad, nombre_oportunidad
  from public.cotizaciones c join public.oportunidades o on o.id = c.oportunidad_id
  where c.id = r.cotizacion_id;
  select p.nombre into quien from public.perfiles p where p.id = auth.uid();

  insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace, creado_por)
  select distinct d, 'revision_retirada',
         left('Cotización retirada para corregir: ' || coalesce(nombre_oportunidad, ''), 200),
         left(coalesce(quien, 'Quien autoriza') || ': «' || trim(retirar_revision.motivo) || '»', 2000),
         '/cotizaciones/' || r.cotizacion_id || '?paso=partidas', auth.uid()
  from unnest(array[r.creado_por, ejecutivo]) as d
  where d is not null and d <> auth.uid();
end $$;
revoke execute on function public.retirar_revision(uuid, text) from public, anon;
grant execute on function public.retirar_revision(uuid, text) to authenticated;
