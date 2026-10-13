-- 0035 · Tiempo real (Fase 8, 2026-10-13; propuestas A–F aprobadas por Rodrigo).
--
--   1. Avisos nuevos: enviada a autorización (a quienes autorizan), autorizada y rechazada (a quien la capturó y al
--      ejecutivo), emitida (al ejecutivo, si no la emitió él) y colaborador agregado (al colaborador). Nadie recibe
--      el aviso de lo que él mismo hizo.
--   2. Envío en tiempo real desde la base (Supabase Realtime, `realtime.send`) a canales PRIVADOS, protegidos con
--      reglas sobre `realtime.messages`: cada quien sólo escucha sus avisos («avisos:<su id>»), la bandeja si
--      autoriza («autorizaciones») y las cotizaciones a las que tiene acceso («cotizacion:<id>»). Los mensajes de
--      cambios no llevan cifras ni textos: sólo qué se tocó y quién.
--   3. Suscripciones a avisos de Windows con el sitio cerrado (Web Push): `suscripciones_push`, cada quien las suyas.
--      El servidor envía sólo un título genérico, sin nombres de clientes, folios ni montos (decisión 2026-10-13).
--   4. Preferencias de avisos en el perfil (`preferencias.avisos`), con sonido encendido por omisión.
-- Fuera de Supabase (pruebas con PGlite) el envío en tiempo real no hace nada.

-- ───────────── 1. Avisos nuevos ─────────────

alter table public.notificaciones drop constraint notificaciones_tipo_check;
alter table public.notificaciones add constraint notificaciones_tipo_check
  check (tipo in (
    'revision_retirada', 'cancelacion_solicitada', 'cancelacion_resuelta',
    'revision_enviada', 'revision_autorizada', 'revision_rechazada', 'revision_emitida', 'colaborador_agregado'
  ));

-- Cuándo se mandó como aviso de Windows (Web Push); null = pendiente. Sólo lo escribe el servidor.
alter table public.notificaciones add column push_enviado_en timestamptz;
create index notificaciones_push_pendiente on public.notificaciones (creado_en) where push_enviado_en is null;

-- Personas activas con un permiso (p. ej. quienes autorizan).
create function app.personas_con_permiso(p_permiso text) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select p.id
  from public.perfiles p
  join public.rol_permisos rp on rp.rol_id = p.rol_id
  where p.activo and rp.permiso_id = p_permiso
$$;
revoke execute on function app.personas_con_permiso(text) from public, anon, authenticated;

create function app.avisar_estado_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_op record;
  v_quien text;
  v_rev text := case when new.numero = 0 then 'versión original' else 'Rev ' || app.sufijo_revision(new.numero) end;
  v_enlace text := '/cotizaciones/' || new.cotizacion_id;
begin
  if new.estado is not distinct from old.estado then
    return null;
  end if;
  select o.nombre, o.ejecutivo_id into v_op
  from public.cotizaciones c join public.oportunidades o on o.id = c.oportunidad_id
  where c.id = new.cotizacion_id;
  select p.nombre into v_quien from public.perfiles p where p.id = auth.uid();
  v_quien := coalesce(v_quien, 'El sistema');

  if new.estado = 'pendiente_autorizacion' then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace, creado_por)
    select d, 'revision_enviada',
           left(v_quien || ' envió a autorización la ' || v_rev, 200),
           left(coalesce(v_op.nombre, ''), 2000), v_enlace || '?paso=autorizacion', auth.uid()
    from app.personas_con_permiso('utilidad.autorizar') d
    where d is distinct from auth.uid();
  elsif new.estado in ('autorizada', 'rechazada') and old.estado = 'pendiente_autorizacion' then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace, creado_por)
    select distinct d,
           case when new.estado = 'autorizada' then 'revision_autorizada' else 'revision_rechazada' end,
           left(v_quien || case when new.estado = 'autorizada' then ' autorizó la ' else ' rechazó la ' end || v_rev, 200),
           left(coalesce(v_op.nombre, '') || case
             when new.estado = 'rechazada' and nullif(trim(new.comentario_autorizacion), '') is not null
               then ' · «' || trim(new.comentario_autorizacion) || '»'
             else '' end, 2000),
           v_enlace, auth.uid()
    from unnest(array[new.creado_por, v_op.ejecutivo_id]) d
    where d is not null and d is distinct from auth.uid();
  elsif new.estado = 'emitida' then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace, creado_por)
    select v_op.ejecutivo_id, 'revision_emitida',
           left(v_quien || ' emitió la cotización ' || coalesce(new.folio, ''), 200),
           left(coalesce(v_op.nombre, ''), 2000), v_enlace || '?paso=emision', auth.uid()
    where v_op.ejecutivo_id is not null and v_op.ejecutivo_id is distinct from auth.uid();
  end if;
  return null;
end $$;

create trigger avisar_estado after update of estado on public.revisiones
  for each row execute function app.avisar_estado_revision();

create function app.avisar_colaborador() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_quien text;
begin
  if new.perfil_id is not distinct from auth.uid() then
    return null;
  end if;
  select p.nombre into v_quien from public.perfiles p where p.id = auth.uid();
  insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace, creado_por)
  select new.perfil_id, 'colaborador_agregado',
         left(coalesce(v_quien, 'Alguien') || ' te agregó como colaborador', 200),
         left(o.nombre, 2000), '/oportunidades/' || o.id, auth.uid()
  from public.oportunidades o where o.id = new.oportunidad_id;
  return null;
end $$;

create trigger avisar_colaborador after insert on public.oportunidad_colaboradores
  for each row execute function app.avisar_colaborador();

-- ───────────── 2. Envío en tiempo real ─────────────

-- Manda un mensaje a un canal privado de Supabase Realtime. Nunca interrumpe la operación que lo origina: si
-- Realtime no existe (pruebas) o falla, no pasa nada.
create function app.tiempo_real(p_tema text, p_evento text, p_datos jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then
    return;
  end if;
  execute 'select realtime.send($1, $2, $3, true)' using p_datos, p_evento, p_tema;
exception when others then
  null;
end $$;
revoke execute on function app.tiempo_real(text, text, jsonb) from public, anon, authenticated;

-- Aviso nuevo → canal de su destinatario.
create function app.tiempo_real_aviso() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.tiempo_real('avisos:' || new.destinatario_id, 'aviso', jsonb_build_object(
    'id', new.id, 'tipo', new.tipo, 'titulo', new.titulo, 'cuerpo', new.cuerpo, 'enlace', new.enlace,
    'creado_en', new.creado_en));
  return null;
end $$;
create trigger tiempo_real after insert on public.notificaciones
  for each row execute function app.tiempo_real_aviso();

-- Un cambio en una cotización → su canal (una vez por transacción y tipo de cambio), y a la bandeja de
-- autorizaciones si entró o salió de «pendiente de autorización». Sin cifras ni textos.
create function app.tiempo_real_cotizacion() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  fila jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_revision uuid;
  v_cotizacion uuid;
  v_grupo text;
  v_quien text;
  v_marca text;
begin
  v_grupo := case
    when tg_table_name in ('partidas', 'partida_costos', 'propuestas', 'partida_prorrateos') then 'partidas'
    when tg_table_name = 'revision_condiciones' then 'condiciones'
    when tg_table_name = 'propuesta_financiamientos' then 'financiamiento'
    else 'revision'
  end;
  case tg_table_name
    when 'revisiones' then
      v_revision := (fila ->> 'id')::uuid;
      v_cotizacion := (fila ->> 'cotizacion_id')::uuid;
    when 'propuestas', 'revision_condiciones' then
      v_revision := (fila ->> 'revision_id')::uuid;
    when 'partidas', 'propuesta_financiamientos' then
      select pr.revision_id into v_revision from public.propuestas pr where pr.id = (fila ->> 'propuesta_id')::uuid;
    else
      select pr.revision_id into v_revision
      from public.partidas pa join public.propuestas pr on pr.id = pa.propuesta_id
      where pa.id = (fila ->> 'partida_id')::uuid;
  end case;
  if v_cotizacion is null and v_revision is not null then
    select r.cotizacion_id into v_cotizacion from public.revisiones r where r.id = v_revision;
  end if;
  if v_cotizacion is null then
    return null;
  end if;

  select p.nombre into v_quien from public.perfiles p where p.id = auth.uid();

  -- (Se lee de jsonb: `old.estado` no existe en las demás tablas.)
  if tg_table_name = 'revisiones' and tg_op = 'UPDATE'
     and (to_jsonb(old) ->> 'estado') is distinct from (fila ->> 'estado') then
    perform app.tiempo_real('cotizacion:' || v_cotizacion, 'cambio', jsonb_build_object(
      'grupo', 'estado', 'estado', fila ->> 'estado', 'anterior', to_jsonb(old) ->> 'estado',
      'revision', v_revision, 'usuario', auth.uid(), 'nombre', v_quien));
    if 'pendiente_autorizacion' in (to_jsonb(old) ->> 'estado', fila ->> 'estado') then
      perform app.tiempo_real('autorizaciones', 'bandeja', jsonb_build_object(
        'revision', v_revision, 'estado', fila ->> 'estado', 'usuario', auth.uid()));
    end if;
    return null;
  end if;

  -- Una sola vez por transacción, cotización y grupo (guardar 40 partidas manda un mensaje).
  v_marca := 'celmi.rt_' || replace(v_cotizacion::text, '-', '') || '_' || v_grupo;
  if current_setting(v_marca, true) = '1' then
    return null;
  end if;
  perform set_config(v_marca, '1', true);
  perform app.tiempo_real('cotizacion:' || v_cotizacion, 'cambio', jsonb_build_object(
    'grupo', v_grupo, 'revision', v_revision, 'usuario', auth.uid(), 'nombre', v_quien));
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'revisiones', 'propuestas', 'partidas', 'partida_costos', 'partida_prorrateos',
    'revision_condiciones', 'propuesta_financiamientos'
  ]
  loop
    execute format(
      'create trigger tiempo_real after insert or update or delete on public.%I
         for each row execute function app.tiempo_real_cotizacion()', t);
  end loop;
end $$;

-- Cotización de un tema «cotizacion:<uuid>» (null si el tema no tiene esa forma).
create function app.cotizacion_de_tema(p_tema text) returns uuid
language sql immutable set search_path = '' as $$
  select case when p_tema ~ '^cotizacion:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then substr(p_tema, 12)::uuid end
$$;

-- Quién puede escuchar (y, en las cotizaciones, anunciar su presencia en) cada canal privado.
create function app.puede_usar_tema(p_tema text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.sesion_valida() and (
    p_tema = 'avisos:' || auth.uid()::text
    or (p_tema = 'autorizaciones' and app.tiene_permiso('utilidad.autorizar'))
    or (app.cotizacion_de_tema(p_tema) is not null
        and app.puede_ver_oportunidad(app.oportunidad_de_cotizacion(app.cotizacion_de_tema(p_tema))))
  )
$$;
grant execute on function app.puede_usar_tema(text) to authenticated;

do $$
begin
  if to_regclass('realtime.messages') is null or to_regprocedure('realtime.topic()') is null then
    return;
  end if;
  execute $p$
    create policy celmi_escuchar on realtime.messages for select to authenticated
      using (app.puede_usar_tema(realtime.topic()))
  $p$;
  -- Desde el navegador sólo se anuncia la presencia («también la están viendo»); los cambios los manda la base.
  execute $p$
    create policy celmi_presencia on realtime.messages for insert to authenticated
      with check (extension = 'presence' and app.cotizacion_de_tema(realtime.topic()) is not null
                  and app.puede_usar_tema(realtime.topic()))
  $p$;
end $$;

-- ───────────── 3. Avisos de Windows con el sitio cerrado (Web Push) ─────────────

create table public.suscripciones_push (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{16,32}$'),
  dispositivo text not null default '' check (length(dispositivo) <= 120),
  creado_en timestamptz not null default now(),
  ultimo_envio timestamptz
);
create index suscripciones_push_usuario on public.suscripciones_push (usuario_id);

alter table public.suscripciones_push enable row level security;
revoke all on public.suscripciones_push from anon, authenticated;
grant select, delete on public.suscripciones_push to authenticated;
grant insert (endpoint, p256dh, auth, dispositivo) on public.suscripciones_push to authenticated;
create policy suscripciones_ver on public.suscripciones_push for select to authenticated
  using (app.sesion_valida() and usuario_id = auth.uid());
create policy suscripciones_alta on public.suscripciones_push for insert to authenticated
  with check (app.sesion_valida() and usuario_id = auth.uid());
create policy suscripciones_baja on public.suscripciones_push for delete to authenticated
  using (app.sesion_valida() and usuario_id = auth.uid());

-- ───────────── 4. Preferencias de avisos ─────────────

-- Guarda `preferencias.avisos` del propio perfil sin tocar las demás preferencias. Claves permitidas (booleanas):
-- cotizaciones, autorizacion, sonido, windows. Lo que no se indica conserva su valor; por omisión todo encendido.
create function public.guardar_mis_avisos(avisos jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actual jsonb;
  v_nuevo jsonb;
  k text;
begin
  if not app.sesion_valida() then
    raise exception 'Sesión no válida' using errcode = '42501';
  end if;
  if jsonb_typeof(avisos) <> 'object' then
    raise exception 'Preferencias de avisos no válidas' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(avisos) loop
    if k not in ('cotizaciones', 'autorizacion', 'sonido', 'windows') or jsonb_typeof(avisos -> k) <> 'boolean' then
      raise exception 'Preferencia de avisos no válida: %', k using errcode = '22023';
    end if;
  end loop;
  select coalesce(p.preferencias, '{}') into v_actual from public.perfiles p where p.id = auth.uid();
  v_nuevo := coalesce(v_actual -> 'avisos', '{}') || avisos;
  update public.perfiles set preferencias = jsonb_set(coalesce(v_actual, '{}'), '{avisos}', v_nuevo)
  where id = auth.uid();
  return v_nuevo;
end $$;
revoke execute on function public.guardar_mis_avisos(jsonb) from public, anon;
grant execute on function public.guardar_mis_avisos(jsonb) to authenticated;
