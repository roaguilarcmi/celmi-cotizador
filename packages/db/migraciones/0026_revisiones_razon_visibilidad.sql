-- 0026 · Revisiones con razón y visibilidad (decisiones de Rodrigo, 2026-10-07).
--   · Nuevo motivo «error de captura» (error del capturista), además de solicitud del cliente y mejora de precio
--     (el mayorista mejoró su costo u otro mayorista tiene mejor precio; el costo actual queda como «Precio anterior»).
--   · Toda Rev lleva la explicación de su razón y cómo se presenta: con folio nuevo de cotización, visible para el
--     cliente (aparece en la cotización como Rev A, B…) o interna (no la ve el cliente pero queda en el sistema).
--     La presentación en el PDF y la emisión con folio se implementan en la Fase 4.

alter type public.motivo_revision add value if not exists 'error_captura';

alter table public.revisiones
  add column razon text not null default '' check (length(razon) <= 1000),
  add column visibilidad text not null default 'visible' check (visibilidad in ('nuevo_folio', 'visible', 'interna'));

drop function public.crear_revision(uuid, public.motivo_revision);

create function public.crear_revision(cotizacion uuid, motivo public.motivo_revision, razon text,
                                      visibilidad text default 'visible') returns uuid
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
    raise exception 'Una revisión nueva es por solicitud del cliente, mejora de precio o error de captura'
      using errcode = '22023';
  end if;
  if length(trim(coalesce(razon, ''))) < 5 then
    raise exception 'Explica la razón de la revisión' using errcode = '23514';
  end if;
  if visibilidad not in ('nuevo_folio', 'visible', 'interna') then
    raise exception 'Indica cómo se presenta la revisión' using errcode = '22023';
  end if;
  select * into anterior from public.revisiones r where r.cotizacion_id = cotizacion order by r.numero desc limit 1;
  if anterior.id is null then
    raise exception 'La cotización no existe o no tienes acceso' using errcode = '42501';
  end if;
  if anterior.estado not in ('autorizada', 'emitida') then
    raise exception 'Sólo se crea una revisión nueva a partir de una autorizada' using errcode = '23514';
  end if;

  insert into public.revisiones (cotizacion_id, numero, revision_anterior_id, motivo, estado, creado_por,
                                 vigencia_hasta, condiciones, razon, visibilidad)
  values (cotizacion, anterior.numero + 1, anterior.id, motivo, 'borrador', auth.uid(),
          anterior.vigencia_hasta, anterior.condiciones, left(trim(razon), 1000), visibilidad)
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

revoke execute on function public.crear_revision(uuid, public.motivo_revision, text, text) from public, anon;
grant execute on function public.crear_revision(uuid, public.motivo_revision, text, text) to authenticated;
