-- 0014 · Fase 3A: reglas de cotización (decisiones de Rodrigo, 2026-10-05).
--   · Ciclo de una revisión: borrador → pendiente_autorizacion → autorizada | rechazada; emitida (Fase 4, con folio).
--     Mientras está pendiente o autorizada, quien la prepara ya no cambia partidas ni costos.
--   · Para enviarla a autorización: al menos una partida y todas con costo. Para autorizarla: todas con precio.
--   · Precio nunca por debajo del costo (no hay utilidad negativa).
--   · Tipo de cambio con 5 decimales. Cantidades enteras (ya lo exigía el esquema).
--   · Adicionales (propuesta de tipo adicional): el ejecutivo marca, por partida, cuáles se suman.
--   · Nueva revisión (Rev A, B…): copia la anterior sin utilidad ni precios, así que vuelve a pasar por autorización;
--     si es por mejora de precio, el costo anterior queda como «Precio anterior».

-- ───────────── Tipo de cambio: 5 decimales ─────────────
alter table public.partida_costos
  add constraint tipo_cambio_5_decimales check (tipo_cambio = round(tipo_cambio, 5));

-- ───────────── Propuestas adicionales y partidas que se suman ─────────────
alter table public.propuestas add column es_adicional boolean not null default false;
alter table public.partidas add column se_suma boolean not null default false;
-- Descripción con formato (JSON validado por la aplicación, igual que tareas y seguimiento).
alter table public.partidas add column descripcion_contenido jsonb
  check (descripcion_contenido is null or jsonb_typeof(descripcion_contenido) = 'object');

-- ───────────── Datos de la revisión (paso 3 del wizard y autorización) ─────────────
alter table public.revisiones
  add column vigencia_hasta timestamptz,
  add column condiciones jsonb check (condiciones is null or jsonb_typeof(condiciones) = 'object'),
  add column enviada_en timestamptz,
  add column comentario_autorizacion text not null default '' check (length(comentario_autorizacion) <= 2000);

-- ───────────── Bloqueo: también mientras espera autorización ─────────────
create or replace function app.revision_bloqueada(revision uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select r.estado in ('pendiente_autorizacion', 'autorizada', 'emitida') from public.revisiones r where r.id = revision),
    true
  )
$$;

-- Quien prepara la cotización mueve su revisión entre borrador y pendiente (y retoma una rechazada);
-- autorizar o rechazar requiere el permiso de autorización. Las transiciones las valida app.reglas_revision().
drop policy revisiones_editar on public.revisiones;
create policy revisiones_editar on public.revisiones for update to authenticated
  using (
    app.tiene_permiso('utilidad.autorizar')
    or (app.puede_editar_oportunidad(app.oportunidad_de_cotizacion(cotizacion_id))
        and estado in ('borrador', 'pendiente_autorizacion', 'rechazada'))
  )
  with check (
    app.tiene_permiso('utilidad.autorizar')
    or (app.puede_editar_oportunidad(app.oportunidad_de_cotizacion(cotizacion_id))
        and estado in ('borrador', 'pendiente_autorizacion'))
  );

-- Al (re)enviar una revisión a autorización se descartan precios de una ronda anterior: se autorizan otra vez.
create function app.descartar_precios(revision uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.partida_precios p
  using public.partidas pa join public.propuestas pr on pr.id = pa.propuesta_id
  where p.partida_id = pa.id and pr.revision_id = revision
$$;
revoke execute on function app.descartar_precios(uuid) from public, authenticated;

-- security definer: puede descartar precios (app.descartar_precios no es ejecutable por los usuarios).
create function app.reglas_revision() returns trigger
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
    -- Sin cambio de estado: sólo se editan los datos de una revisión en borrador (o el comentario al autorizar).
    if old.estado <> 'borrador' and (new.vigencia_hasta is distinct from old.vigencia_hasta
                                     or new.condiciones is distinct from old.condiciones) then
      raise exception 'Sólo una revisión en borrador cambia su vigencia y condiciones' using errcode = '42501';
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

create trigger reglas before update on public.revisiones for each row execute function app.reglas_revision();

-- ───────────── Precio: nunca por debajo del costo ─────────────
create function app.precio_sobre_costo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  costo numeric;
begin
  select round(c.costo_unitario * c.tipo_cambio, 2) into costo from public.partida_costos c where c.partida_id = new.partida_id;
  if costo is null then
    raise exception 'La partida no tiene costo' using errcode = '23514';
  end if;
  if new.precio_unitario < costo then
    raise exception 'El precio no puede ser menor que el costo (no hay utilidad negativa)' using errcode = '23514';
  end if;
  -- Sólo mientras la revisión espera autorización.
  if (select r.estado from public.revisiones r where r.id = app.revision_de_partida(new.partida_id)) <> 'pendiente_autorizacion' then
    raise exception 'Los precios se registran al autorizar' using errcode = '42501';
  end if;
  new.autorizado_por := auth.uid();
  new.autorizado_en := now();
  return new;
end $$;

create trigger sobre_costo before insert or update on public.partida_precios
  for each row execute function app.precio_sobre_costo();

-- ───────────── Nueva revisión ─────────────
-- Copia la última revisión (propuestas, partidas y costos; NO utilidad ni precios) en una nueva en borrador.
-- Se ejecuta con los permisos de quien la pide: RLS decide si puede.
create function public.crear_revision(cotizacion uuid, motivo public.motivo_revision) returns uuid
language plpgsql set search_path = '' as $$
declare
  anterior public.revisiones;
  nueva uuid;
  p record;
  nueva_propuesta uuid;
  pa record;
  nueva_partida uuid;
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
    for pa in select * from public.partidas x where x.propuesta_id = p.id order by x.orden loop
      insert into public.partidas (propuesta_id, orden, sku, marca_id, descripcion, descripcion_contenido, entrega,
                                   unidad_id, cantidad, oculta_al_cliente, se_suma)
      values (nueva_propuesta, pa.orden, pa.sku, pa.marca_id, pa.descripcion, pa.descripcion_contenido, pa.entrega,
              pa.unidad_id, pa.cantidad, pa.oculta_al_cliente, pa.se_suma)
      returning id into nueva_partida;
      insert into public.partida_costos (partida_id, mayorista_id, moneda, costo_unitario, costo_anterior, tipo_cambio, vigencia)
      select nueva_partida, c.mayorista_id, c.moneda, c.costo_unitario,
             -- Mejora de precio: el costo vigente pasa a ser el «Precio anterior».
             case when motivo = 'mejora_precio' then c.costo_unitario else c.costo_anterior end,
             c.tipo_cambio, c.vigencia
      from public.partida_costos c where c.partida_id = pa.id;
    end loop;
  end loop;
  return nueva;
end $$;
revoke execute on function public.crear_revision(uuid, public.motivo_revision) from public, anon;
grant execute on function public.crear_revision(uuid, public.motivo_revision) to authenticated;

comment on function public.asignar_folio(uuid) is 'Asigna el folio al emitir la cotización (decisión 2026-10-05; Fase 4).';
