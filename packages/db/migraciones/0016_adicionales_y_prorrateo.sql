-- 0016 · Fase 3B: adicionales de una partida y cargos prorrateados (decisiones de Rodrigo, 2026-10-05).
--   · Una partida puede tener adicionales (partida_padre_id, un solo nivel), cada uno con su costo y su utilidad:
--       presentacion 'linea'    → línea propia en la cotización;
--       presentacion 'incluida' → oculta: el cliente ve una sola línea (precio de la partida + el de sus incluidos).
--     El incluido lleva siempre la misma cantidad que su partida.
--   · Un cargo prorrateado (presentacion 'prorrateada', partida de primer nivel) reparte su precio entre las partidas que
--     elija el ejecutivo (partida_prorrateos) en proporción a su precio de venta. No es línea para el cliente.

alter table public.partidas
  add column partida_padre_id uuid references public.partidas (id) on delete cascade,
  add column presentacion text not null default 'linea' check (presentacion in ('linea', 'incluida', 'prorrateada'));
create index on public.partidas (partida_padre_id);

create function app.reglas_partida() returns trigger
language plpgsql set search_path = '' as $$
declare
  padre record;
begin
  if new.partida_padre_id is null then
    if new.presentacion = 'incluida' then
      raise exception 'Sólo un adicional de una partida puede ir incluido en su precio' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.presentacion = 'prorrateada' then
    raise exception 'Un cargo prorrateado no pertenece a una partida' using errcode = '23514';
  end if;
  select p.propuesta_id, p.partida_padre_id, p.presentacion, p.cantidad into padre
  from public.partidas p where p.id = new.partida_padre_id;
  if not found or padre.propuesta_id <> new.propuesta_id then
    raise exception 'El adicional debe estar en la misma propuesta que su partida' using errcode = '23514';
  end if;
  if padre.partida_padre_id is not null or padre.presentacion <> 'linea' then
    raise exception 'Un adicional no puede tener adicionales' using errcode = '23514';
  end if;
  -- Regla 2026-10-05: el incluido lleva la misma cantidad que su partida.
  if new.presentacion = 'incluida' then
    new.cantidad := padre.cantidad;
  end if;
  return new;
end $$;
create trigger reglas before insert or update on public.partidas for each row execute function app.reglas_partida();

-- Si cambia la cantidad de una partida, sus incluidos la siguen.
create function app.cantidad_a_incluidos() returns trigger
language plpgsql set search_path = '' as $$
begin
  update public.partidas set cantidad = new.cantidad
  where partida_padre_id = new.id and presentacion = 'incluida' and cantidad <> new.cantidad;
  return null;
end $$;
create trigger cantidad_a_incluidos after update of cantidad on public.partidas
  for each row execute function app.cantidad_a_incluidos();

-- ───────────── Cargos prorrateados ─────────────
create table public.partida_prorrateos (
  partida_id uuid not null references public.partidas (id) on delete cascade,
  destino_id uuid not null references public.partidas (id) on delete cascade,
  primary key (partida_id, destino_id),
  check (partida_id <> destino_id)
);
create index on public.partida_prorrateos (destino_id);

alter table public.partida_prorrateos enable row level security;
revoke all on public.partida_prorrateos from anon;
grant select, insert, delete on public.partida_prorrateos to authenticated;

create policy prorrateos_ver on public.partida_prorrateos for select to authenticated
  using (app.puede_ver_oportunidad(app.oportunidad_de_revision(app.revision_de_partida(partida_id))));
create policy prorrateos_alta on public.partida_prorrateos for insert to authenticated
  with check (app.puede_modificar_revision(app.revision_de_partida(partida_id)));
create policy prorrateos_baja on public.partida_prorrateos for delete to authenticated
  using (app.puede_modificar_revision(app.revision_de_partida(partida_id)));

create function app.reglas_prorrateo() returns trigger
language plpgsql set search_path = '' as $$
declare
  origen record;
  destino record;
begin
  select p.propuesta_id, p.presentacion into origen from public.partidas p where p.id = new.partida_id;
  select p.propuesta_id, p.presentacion, p.partida_padre_id into destino from public.partidas p where p.id = new.destino_id;
  if origen.presentacion <> 'prorrateada' then
    raise exception 'Sólo un cargo prorrateado se reparte entre partidas' using errcode = '23514';
  end if;
  if destino.propuesta_id <> origen.propuesta_id or destino.partida_padre_id is not null or destino.presentacion <> 'linea' then
    raise exception 'El cargo se reparte entre partidas de su misma propuesta' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger reglas before insert on public.partida_prorrateos
  for each row execute function app.reglas_prorrateo();
create trigger auditar after insert or delete on public.partida_prorrateos
  for each row execute function app.auditar();

-- Para enviar a autorización, cada cargo prorrateado debe repartirse entre al menos una partida.
create function app.revision_con_prorrateos_completos() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  sueltos int;
begin
  if new.estado = 'pendiente_autorizacion' and old.estado is distinct from new.estado then
    select count(*) into sueltos
    from public.partidas pa join public.propuestas pr on pr.id = pa.propuesta_id
    where pr.revision_id = new.id and pa.presentacion = 'prorrateada'
      and not exists (select 1 from public.partida_prorrateos x where x.partida_id = pa.id);
    if sueltos > 0 then
      raise exception 'Indica entre qué partidas se reparte cada cargo prorrateado (% sin asignar)', sueltos using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger reglas_prorrateo before update on public.revisiones
  for each row execute function app.revision_con_prorrateos_completos();

-- ───────────── Guardar partidas: con adicionales y prorrateos ─────────────
-- Cada partida trae una «clave» local; los adicionales van en «componentes» y un cargo prorrateado indica en
-- «prorratear_entre» las claves de las partidas que lo reciben (pueden ser nuevas: aún sin id).
create or replace function public.guardar_partidas(revision uuid, propuestas jsonb) returns void
language plpgsql set search_path = '' as $$
declare
  p jsonb;
  pa jsonb;
  co jsonb;
  c jsonb;
  dest jsonb;
  id_propuesta uuid;
  id_partida uuid;
  orden_p int := 0;
  orden_pa int;
  propuestas_vivas uuid[] := '{}';
  partidas_vivas uuid[] := '{}';
  ids jsonb := '{}';
begin
  if jsonb_typeof(propuestas) <> 'array' then
    raise exception 'Formato no válido' using errcode = '22023';
  end if;
  if not exists (select 1 from public.revisiones r where r.id = revision) then
    raise exception 'La revisión no existe o no tienes acceso' using errcode = '42501';
  end if;
  if app.revision_bloqueada(revision) and not app.tiene_permiso('modificaciones.autorizar') then
    raise exception 'La revisión ya no se puede modificar (está en autorización o autorizada)' using errcode = '42501';
  end if;

  for p in select * from jsonb_array_elements(propuestas) loop
    if p->>'id' <> '' then propuestas_vivas := propuestas_vivas || (p->>'id')::uuid; end if;
    for pa in select * from jsonb_array_elements(coalesce(p->'partidas', '[]')) loop
      if pa->>'id' <> '' then partidas_vivas := partidas_vivas || (pa->>'id')::uuid; end if;
      for co in select * from jsonb_array_elements(coalesce(pa->'componentes', '[]')) loop
        if co->>'id' <> '' then partidas_vivas := partidas_vivas || (co->>'id')::uuid; end if;
      end loop;
    end loop;
  end loop;
  delete from public.partidas x using public.propuestas pr
  where x.propuesta_id = pr.id and pr.revision_id = revision and not (x.id = any (partidas_vivas));
  delete from public.propuestas pr where pr.revision_id = revision and not (pr.id = any (propuestas_vivas));
  -- Los repartos se rehacen completos.
  delete from public.partida_prorrateos x using public.partidas pa, public.propuestas pr
  where x.partida_id = pa.id and pa.propuesta_id = pr.id and pr.revision_id = revision;

  for p in select * from jsonb_array_elements(propuestas) loop
    orden_p := orden_p + 1;
    if p->>'id' <> '' then
      id_propuesta := (p->>'id')::uuid;
      update public.propuestas set orden = orden_p, nombre = p->>'nombre', tipo = coalesce(p->>'tipo', ''),
             es_adicional = coalesce((p->>'es_adicional')::boolean, false)
      where id = id_propuesta and revision_id = revision;
      if not found then raise exception 'Propuesta no válida' using errcode = '42501'; end if;
    else
      insert into public.propuestas (revision_id, orden, nombre, tipo, es_adicional)
      values (revision, orden_p, p->>'nombre', coalesce(p->>'tipo', ''), coalesce((p->>'es_adicional')::boolean, false))
      returning id into id_propuesta;
    end if;

    orden_pa := 0;
    for pa in select * from jsonb_array_elements(coalesce(p->'partidas', '[]')) loop
      orden_pa := orden_pa + 1;
      id_partida := app.guardar_una_partida(revision, id_propuesta, null, orden_pa, pa);
      ids := ids || jsonb_build_object(coalesce(nullif(pa->>'clave', ''), id_partida::text), id_partida);
      for co in select * from jsonb_array_elements(coalesce(pa->'componentes', '[]')) loop
        orden_pa := orden_pa + 1;
        perform app.guardar_una_partida(revision, id_propuesta, id_partida, orden_pa, co);
      end loop;
    end loop;

    for pa in select * from jsonb_array_elements(coalesce(p->'partidas', '[]')) loop
      for dest in select * from jsonb_array_elements(coalesce(pa->'prorratear_entre', '[]')) loop
        if ids ? (dest #>> '{}') then
          insert into public.partida_prorrateos (partida_id, destino_id)
          values ((ids->>coalesce(nullif(pa->>'clave', ''), pa->>'id'))::uuid, (ids->>(dest #>> '{}'))::uuid);
        end if;
      end loop;
    end loop;
  end loop;
end $$;

-- Una partida (o adicional) con su costo. Devuelve su id.
create function app.guardar_una_partida(revision uuid, id_propuesta uuid, padre uuid, orden int, pa jsonb) returns uuid
language plpgsql set search_path = '' as $$
declare
  id_partida uuid;
  c jsonb := pa->'costo';
begin
  if pa->>'id' <> '' then
    id_partida := (pa->>'id')::uuid;
    update public.partidas set
      propuesta_id = id_propuesta, partida_padre_id = padre, orden = guardar_una_partida.orden,
      sku = coalesce(pa->>'sku', ''), marca_id = nullif(pa->>'marca_id', '')::uuid, descripcion = pa->>'descripcion',
      descripcion_contenido = case when jsonb_typeof(pa->'descripcion_contenido') = 'object' then pa->'descripcion_contenido' end,
      entrega = coalesce(pa->>'entrega', ''), unidad_id = nullif(pa->>'unidad_id', ''),
      cantidad = (pa->>'cantidad')::int, se_suma = coalesce((pa->>'se_suma')::boolean, false),
      presentacion = coalesce(nullif(pa->>'presentacion', ''), 'linea'),
      oculta_al_cliente = coalesce(nullif(pa->>'presentacion', ''), 'linea') <> 'linea'
    where id = id_partida
      and propuesta_id in (select x.id from public.propuestas x where x.revision_id = revision);
    if not found then raise exception 'Partida no válida' using errcode = '42501'; end if;
  else
    insert into public.partidas (propuesta_id, partida_padre_id, orden, sku, marca_id, descripcion, descripcion_contenido,
                                 entrega, unidad_id, cantidad, se_suma, presentacion, oculta_al_cliente)
    values (id_propuesta, padre, guardar_una_partida.orden, coalesce(pa->>'sku', ''), nullif(pa->>'marca_id', '')::uuid,
            pa->>'descripcion',
            case when jsonb_typeof(pa->'descripcion_contenido') = 'object' then pa->'descripcion_contenido' end,
            coalesce(pa->>'entrega', ''), nullif(pa->>'unidad_id', ''), (pa->>'cantidad')::int,
            coalesce((pa->>'se_suma')::boolean, false), coalesce(nullif(pa->>'presentacion', ''), 'linea'),
            coalesce(nullif(pa->>'presentacion', ''), 'linea') <> 'linea')
    returning id into id_partida;
  end if;

  if c is null or jsonb_typeof(c) <> 'object' then
    delete from public.partida_costos where partida_id = id_partida;
  else
    insert into public.partida_costos (partida_id, mayorista_id, moneda, costo_unitario, tipo_cambio, vigencia)
    values (id_partida, nullif(c->>'mayorista_id', '')::uuid, coalesce(nullif(c->>'moneda', ''), 'MXN'),
            (c->>'costo_unitario')::numeric, coalesce(nullif(c->>'tipo_cambio', '')::numeric, 1),
            nullif(c->>'vigencia', '')::date)
    on conflict (partida_id) do update set
      mayorista_id = excluded.mayorista_id, moneda = excluded.moneda, costo_unitario = excluded.costo_unitario,
      tipo_cambio = excluded.tipo_cambio, vigencia = excluded.vigencia;
  end if;
  return id_partida;
end $$;

-- ───────────── Nueva revisión: también copia adicionales y prorrateos ─────────────
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
    insert into public.propuestas (revision_id, orden, nombre, tipo, modalidad, es_adicional)
    values (nueva, p.orden, p.nombre, p.tipo, p.modalidad, p.es_adicional)
    returning id into nueva_propuesta;
    -- Primero las partidas y después sus adicionales (el adicional necesita el id nuevo de su partida).
    for pa in select * from public.partidas x where x.propuesta_id = p.id
              order by (x.partida_padre_id is not null), x.orden loop
      insert into public.partidas (propuesta_id, partida_padre_id, orden, sku, marca_id, descripcion,
                                   descripcion_contenido, entrega, unidad_id, cantidad, oculta_al_cliente, se_suma,
                                   presentacion)
      values (nueva_propuesta, (mapa->>(pa.partida_padre_id::text))::uuid, pa.orden, pa.sku, pa.marca_id,
              pa.descripcion, pa.descripcion_contenido, pa.entrega, pa.unidad_id, pa.cantidad, pa.oculta_al_cliente,
              pa.se_suma, pa.presentacion)
      returning id into nueva_partida;
      mapa := mapa || jsonb_build_object(pa.id::text, nueva_partida);
      insert into public.partida_costos (partida_id, mayorista_id, moneda, costo_unitario, costo_anterior, tipo_cambio, vigencia)
      select nueva_partida, c.mayorista_id, c.moneda, c.costo_unitario,
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
