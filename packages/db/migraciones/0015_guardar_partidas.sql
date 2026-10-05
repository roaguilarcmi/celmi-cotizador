-- 0015 · Fase 3B: guardar las propuestas y partidas de una revisión en una sola transacción.
--   · La pantalla edita todo y lo guarda junto: altas, cambios, bajas y nuevo orden (el orden único por propuesta es
--     «deferrable», así que intercambiar posiciones sólo es válido dentro de una transacción).
--   · Se ejecuta con los permisos de quien guarda: RLS decide (revisión en borrador o rechazada, costos.ver…).
--   · El «Precio anterior» (costo_anterior) no se captura aquí: lo pone public.crear_revision en una mejora de precio.

create function public.guardar_partidas(revision uuid, propuestas jsonb) returns void
language plpgsql set search_path = '' as $$
declare
  p jsonb;
  pa jsonb;
  c jsonb;
  id_propuesta uuid;
  id_partida uuid;
  orden_p int := 0;
  orden_pa int;
  propuestas_vivas uuid[] := '{}';
  partidas_vivas uuid[] := '{}';
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

  -- Ids que se conservan (los demás de esta revisión se borran).
  for p in select * from jsonb_array_elements(propuestas) loop
    if p ? 'id' and p->>'id' <> '' then propuestas_vivas := propuestas_vivas || (p->>'id')::uuid; end if;
    for pa in select * from jsonb_array_elements(coalesce(p->'partidas', '[]')) loop
      if pa ? 'id' and pa->>'id' <> '' then partidas_vivas := partidas_vivas || (pa->>'id')::uuid; end if;
    end loop;
  end loop;
  delete from public.partidas x using public.propuestas pr
  where x.propuesta_id = pr.id and pr.revision_id = revision and not (x.id = any (partidas_vivas));
  delete from public.propuestas pr where pr.revision_id = revision and not (pr.id = any (propuestas_vivas));

  for p in select * from jsonb_array_elements(propuestas) loop
    orden_p := orden_p + 1;
    if p ? 'id' and p->>'id' <> '' then
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
      if pa ? 'id' and pa->>'id' <> '' then
        id_partida := (pa->>'id')::uuid;
        update public.partidas set
          propuesta_id = id_propuesta, orden = orden_pa, sku = coalesce(pa->>'sku', ''),
          marca_id = nullif(pa->>'marca_id', '')::uuid, descripcion = pa->>'descripcion',
          descripcion_contenido = case when jsonb_typeof(pa->'descripcion_contenido') = 'object' then pa->'descripcion_contenido' end,
          entrega = coalesce(pa->>'entrega', ''), unidad_id = nullif(pa->>'unidad_id', ''),
          cantidad = (pa->>'cantidad')::int, se_suma = coalesce((pa->>'se_suma')::boolean, false),
          oculta_al_cliente = coalesce((pa->>'oculta_al_cliente')::boolean, false)
        where id = id_partida
          and propuesta_id in (select x.id from public.propuestas x where x.revision_id = revision);
        if not found then raise exception 'Partida no válida' using errcode = '42501'; end if;
      else
        insert into public.partidas (propuesta_id, orden, sku, marca_id, descripcion, descripcion_contenido, entrega,
                                     unidad_id, cantidad, se_suma, oculta_al_cliente)
        values (id_propuesta, orden_pa, coalesce(pa->>'sku', ''), nullif(pa->>'marca_id', '')::uuid, pa->>'descripcion',
                case when jsonb_typeof(pa->'descripcion_contenido') = 'object' then pa->'descripcion_contenido' end,
                coalesce(pa->>'entrega', ''), nullif(pa->>'unidad_id', ''), (pa->>'cantidad')::int,
                coalesce((pa->>'se_suma')::boolean, false), coalesce((pa->>'oculta_al_cliente')::boolean, false))
        returning id into id_partida;
      end if;

      c := pa->'costo';
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
    end loop;
  end loop;
end $$;
revoke execute on function public.guardar_partidas(uuid, jsonb) from public, anon;
grant execute on function public.guardar_partidas(uuid, jsonb) to authenticated;
