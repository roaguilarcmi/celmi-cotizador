-- 0031 · Emisión con folio y cancelación (Fase 4 · B; decisiones de Rodrigo, 2026-10-12).
--   · Emite cualquiera con acceso a la cotización (permiso pdf.emitir), sólo la revisión vigente y autorizada.
--   · Folio según cómo se presenta la Rev: original o «nuevo folio» → folio nuevo; «visible» → el folio anterior con
--     « Rev A»; «interna» → el folio anterior sin sufijo. Sin folio anterior, se asigna uno limpio. El consecutivo se
--     toma al emitir (no deja huecos).
--   · Cancelar: todos pueden solicitarlo con motivo; sólo quien autoriza aprueba (o cancela directamente). El folio
--     queda cancelado salvo que después se emita otra Rev con ese mismo folio (p. ej. una Rev interna).
--   · Folio, emisión y cancelación sólo los escriben estas funciones (la regla de la revisión lo exige).

alter table public.revisiones
  add column folio text check (length(folio) <= 80),
  add column folio_base text check (length(folio_base) <= 60),
  add column emitida_por uuid references public.perfiles (id),
  add column emitida_en timestamptz,
  add column cancelada_por uuid references public.perfiles (id),
  add column cancelada_en timestamptz,
  add column motivo_cancelacion text not null default '' check (length(motivo_cancelacion) <= 2000),
  add constraint emitida_con_folio check ((estado = 'emitida') = (folio is not null and emitida_en is not null)),
  add constraint cancelada_solo_emitida check (cancelada_en is null or estado = 'emitida');
create index on public.revisiones (folio_base);

-- Sufijo de revisión como en packages/core (sufijoRevision): 1 → A … 26 → Z, 27 → A1…
create function app.sufijo_revision(numero int) returns text
language sql immutable set search_path = '' as $$
  select case when numero <= 0 then null
              else chr(65 + (numero - 1) % 26) || case when (numero - 1) / 26 = 0 then '' else ((numero - 1) / 26)::text end
         end
$$;

-- Folio nuevo del consecutivo anual, sin tocar la cotización (una cotización puede tener varios folios).
create function app.siguiente_folio(anio int) returns text
language plpgsql security definer set search_path = '' as $$
declare
  cfg jsonb;
  consecutivo int;
begin
  select valor into cfg from public.configuracion where clave = 'folio';
  insert into public.folios (anio, ultimo) values (anio, 1)
  on conflict on constraint folios_pkey do update set ultimo = public.folios.ultimo + 1
  returning ultimo into consecutivo;
  if consecutivo >= 10 ^ (cfg ->> 'digitos')::int then
    raise exception 'Se agotaron los folios del año %', anio;
  end if;
  return (cfg ->> 'prefijo') || '-' || anio || lpad(consecutivo::text, (cfg ->> 'digitos')::int, '0');
end $$;
revoke execute on function app.siguiente_folio(int) from public, authenticated;

-- La regla de la revisión admite autorizada → emitida y protege los datos de emisión y cancelación.
create or replace function app.reglas_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  sin_costo int;
  sin_precio int;
  partidas int;
  desde_emision boolean := coalesce(current_setting('app.emision', true), '') = '1';
begin
  if new.cotizacion_id is distinct from old.cotizacion_id or new.numero is distinct from old.numero
     or new.revision_anterior_id is distinct from old.revision_anterior_id or new.motivo is distinct from old.motivo then
    raise exception 'Una revisión no cambia de cotización, número ni motivo' using errcode = '42501';
  end if;
  if not desde_emision and (
       new.folio is distinct from old.folio or new.folio_base is distinct from old.folio_base
       or new.emitida_por is distinct from old.emitida_por or new.emitida_en is distinct from old.emitida_en
       or new.cancelada_por is distinct from old.cancelada_por or new.cancelada_en is distinct from old.cancelada_en
       or new.motivo_cancelacion is distinct from old.motivo_cancelacion) then
    raise exception 'El folio, la emisión y la cancelación sólo se registran al emitir o cancelar' using errcode = '42501';
  end if;
  if new.estado = old.estado then
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
    when old.estado = 'autorizada' and new.estado = 'emitida' and desde_emision then
      null;
    else
      raise exception 'Cambio de estado no permitido: % → %', old.estado, new.estado using errcode = '42501';
  end case;
  return new;
end $$;

-- ───────────── Emitir ─────────────
create function public.emitir_revision(revision uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  r public.revisiones;
  anterior_base text;
  base text;
  folio_final text;
  anio int := extract(year from now() at time zone 'America/Mexico_City')::int;
begin
  select * into r from public.revisiones x where x.id = revision for update;
  if r.id is null or not app.sesion_valida() or not app.tiene_permiso('pdf.emitir')
     or not app.puede_ver_oportunidad(app.oportunidad_de_cotizacion(r.cotizacion_id)) then
    raise exception 'No tienes acceso para emitir esta cotización' using errcode = '42501';
  end if;
  if r.estado <> 'autorizada' then
    raise exception 'Sólo se emite una revisión autorizada' using errcode = '23514';
  end if;
  if exists (select 1 from public.revisiones x where x.cotizacion_id = r.cotizacion_id and x.numero > r.numero) then
    raise exception 'Hay una revisión más reciente; emite la vigente' using errcode = '23514';
  end if;
  -- Bloquea la cotización: dos emisiones simultáneas no toman el mismo folio base.
  perform 1 from public.cotizaciones c where c.id = r.cotizacion_id for update;

  select x.folio_base into anterior_base from public.revisiones x
  where x.cotizacion_id = r.cotizacion_id and x.folio_base is not null
  order by x.numero desc limit 1;

  if r.numero = 0 or r.visibilidad = 'nuevo_folio' or anterior_base is null then
    base := app.siguiente_folio(anio);
  else
    base := anterior_base;
  end if;
  folio_final := case when r.numero > 0 and r.visibilidad = 'visible'
                      then base || ' Rev ' || app.sufijo_revision(r.numero) else base end;

  perform set_config('app.emision', '1', true);
  update public.revisiones
  set estado = 'emitida', folio = folio_final, folio_base = base, emitida_por = auth.uid(), emitida_en = now()
  where id = revision;
  perform set_config('app.emision', '', true);

  -- La cotización muestra su folio vigente (el último asignado).
  update public.cotizaciones
  set folio = base,
      folio_anio = substring(base from '-(\d{4})\d+$')::int,
      folio_consecutivo = substring(base from '-\d{4}(\d+)$')::int
  where id = r.cotizacion_id and folio is distinct from base;
  return folio_final;
end $$;
revoke execute on function public.emitir_revision(uuid) from public, anon;
grant execute on function public.emitir_revision(uuid) to authenticated;

-- ───────────── Cancelación ─────────────
create table public.solicitudes_cancelacion (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.revisiones (id) on delete cascade,
  motivo text not null check (length(trim(motivo)) between 5 and 2000),
  solicitada_por uuid not null references public.perfiles (id),
  solicitada_en timestamptz not null default now(),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  resuelta_por uuid references public.perfiles (id),
  resuelta_en timestamptz,
  comentario text not null default '' check (length(comentario) <= 2000)
);
-- Una sola solicitud pendiente por revisión.
create unique index solicitudes_cancelacion_pendiente on public.solicitudes_cancelacion (revision_id)
  where estado = 'pendiente';
alter table public.solicitudes_cancelacion enable row level security;
revoke all on public.solicitudes_cancelacion from anon;
grant select on public.solicitudes_cancelacion to authenticated;
create policy sc_ver on public.solicitudes_cancelacion for select to authenticated
  using (app.puede_ver_oportunidad(app.oportunidad_de_revision(revision_id))
         or app.tiene_permiso('utilidad.autorizar'));
create trigger auditar after insert or update on public.solicitudes_cancelacion
  for each row execute function app.auditar();

alter table public.notificaciones drop constraint notificaciones_tipo_check;
alter table public.notificaciones add constraint notificaciones_tipo_check
  check (tipo in ('revision_retirada', 'cancelacion_solicitada', 'cancelacion_resuelta'));

-- Marca la revisión emitida como cancelada (uso interno de las funciones de abajo).
create function app.cancelar(revision uuid, motivo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.emision', '1', true);
  update public.revisiones
  set cancelada_por = auth.uid(), cancelada_en = now(), motivo_cancelacion = left(trim(cancelar.motivo), 2000)
  where id = revision;
  perform set_config('app.emision', '', true);
end $$;
revoke execute on function app.cancelar(uuid, text) from public, authenticated;

create function app.validar_cancelable(revision uuid) returns public.revisiones
language plpgsql security definer set search_path = '' as $$
declare
  r public.revisiones;
begin
  select * into r from public.revisiones x where x.id = revision for update;
  if r.id is null or not app.sesion_valida()
     or not (app.puede_ver_oportunidad(app.oportunidad_de_cotizacion(r.cotizacion_id))
             or app.tiene_permiso('utilidad.autorizar')) then
    raise exception 'No tienes acceso a esta cotización' using errcode = '42501';
  end if;
  if r.estado <> 'emitida' then
    raise exception 'Sólo se cancela una cotización emitida' using errcode = '23514';
  end if;
  if r.cancelada_en is not null then
    raise exception 'Esta cotización ya está cancelada' using errcode = '23514';
  end if;
  return r;
end $$;
revoke execute on function app.validar_cancelable(uuid) from public, authenticated;

-- Cualquiera con acceso la solicita; se avisa a quienes autorizan. Quien autoriza la cancela de una vez.
create function public.solicitar_cancelacion(revision uuid, motivo text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  r public.revisiones;
  solicitud uuid;
  quien text;
  nombre_oportunidad text;
begin
  r := app.validar_cancelable(revision);
  if length(trim(coalesce(solicitar_cancelacion.motivo, ''))) < 5 then
    raise exception 'Explica por qué se cancela' using errcode = '23514';
  end if;
  if exists (select 1 from public.solicitudes_cancelacion s where s.revision_id = revision and s.estado = 'pendiente') then
    raise exception 'Ya hay una solicitud de cancelación pendiente' using errcode = '23514';
  end if;

  if app.tiene_permiso('utilidad.autorizar') then
    insert into public.solicitudes_cancelacion (revision_id, motivo, solicitada_por, estado, resuelta_por, resuelta_en)
    values (revision, trim(solicitar_cancelacion.motivo), auth.uid(), 'aprobada', auth.uid(), now())
    returning id into solicitud;
    perform app.cancelar(revision, solicitar_cancelacion.motivo);
    return solicitud;
  end if;

  insert into public.solicitudes_cancelacion (revision_id, motivo, solicitada_por)
  values (revision, trim(solicitar_cancelacion.motivo), auth.uid())
  returning id into solicitud;

  select p.nombre into quien from public.perfiles p where p.id = auth.uid();
  select o.nombre into nombre_oportunidad
  from public.cotizaciones c join public.oportunidades o on o.id = c.oportunidad_id where c.id = r.cotizacion_id;
  insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace, creado_por)
  select p.id, 'cancelacion_solicitada',
         left('Solicitud de cancelación: ' || r.folio, 200),
         left(coalesce(quien, 'Alguien') || ' pide cancelar ' || coalesce(nombre_oportunidad, 'la cotización') || ': «'
              || trim(solicitar_cancelacion.motivo) || '»', 2000),
         '/autorizaciones', auth.uid()
  from public.perfiles p
  join public.rol_permisos rp on rp.rol_id = p.rol_id and rp.permiso_id = 'utilidad.autorizar'
  where p.activo and p.id <> auth.uid();
  return solicitud;
end $$;
revoke execute on function public.solicitar_cancelacion(uuid, text) from public, anon;
grant execute on function public.solicitar_cancelacion(uuid, text) to authenticated;

-- Sólo quien autoriza aprueba o rechaza; se avisa a quien la pidió.
create function public.resolver_cancelacion(solicitud uuid, aprobar boolean, comentario text default '')
returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.solicitudes_cancelacion;
  r public.revisiones;
begin
  if not app.tiene_permiso('utilidad.autorizar') then
    raise exception 'Sólo quien autoriza puede cancelar una cotización' using errcode = '42501';
  end if;
  select * into s from public.solicitudes_cancelacion x where x.id = solicitud for update;
  if s.id is null or s.estado <> 'pendiente' then
    raise exception 'La solicitud ya se resolvió o no existe' using errcode = '23514';
  end if;
  if not aprobar and length(trim(coalesce(comentario, ''))) < 5 then
    raise exception 'Explica por qué no se cancela' using errcode = '23514';
  end if;
  if aprobar then
    r := app.validar_cancelable(s.revision_id);
    perform app.cancelar(s.revision_id, s.motivo);
  else
    select * into r from public.revisiones x where x.id = s.revision_id;
  end if;
  update public.solicitudes_cancelacion
  set estado = case when aprobar then 'aprobada' else 'rechazada' end,
      resuelta_por = auth.uid(), resuelta_en = now(), comentario = left(trim(coalesce(resolver_cancelacion.comentario, '')), 2000)
  where id = solicitud;

  insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace, creado_por)
  select s.solicitada_por, 'cancelacion_resuelta',
         left(case when aprobar then 'Cotización cancelada: ' else 'No se canceló: ' end || r.folio, 200),
         left(coalesce(nullif(trim(resolver_cancelacion.comentario), ''), case when aprobar then 'Se aprobó tu solicitud.' else '' end), 2000),
         '/cotizaciones/' || r.cotizacion_id, auth.uid()
  where s.solicitada_por <> auth.uid();
end $$;
revoke execute on function public.resolver_cancelacion(uuid, boolean, text) from public, anon;
grant execute on function public.resolver_cancelacion(uuid, boolean, text) to authenticated;
