-- 0034 · Consulta de la auditoría (Fase 7, 2026-10-13).
--
-- La tabla `auditoria` ya registra cada cambio (0003). Aquí sólo se agregan funciones de lectura:
--   · public.auditoria_eventos: los cambios con su contexto (cotización, folio, cliente…), sólo con auditoria.ver.
--   · public.auditoria_expedientes: cotizaciones, oportunidades, clientes y usuarios con su número de eventos.
--   · public.historial_cotizacion: la historia de una cotización para quien tiene acceso a ella, sin lo sensible
--     (utilidad y transaccionalidad si no tiene utilidad.ver; costos si no tiene costos.ver).
-- Las tareas personales (tareas, avisos y etapas) nunca se muestran: sólo las ve su dueño (regla 2026-10-05).
-- Nada se borra de la auditoría (decisión 2026-10-13) y no se exporta.
--
-- Una acción del usuario es una transacción: todas sus filas comparten `en` (now() es la hora de inicio de la
-- transacción) y `usuario_id`. Así se agrupan.

-- Último estado conocido de un registro según la propia auditoría (sirve cuando el registro ya se borró).
create function app.fila_auditada(p_tabla text, p_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(a.despues, a.antes)
  from public.auditoria a
  where a.tabla = p_tabla and a.registro_id = p_id
  order by a.id desc
  limit 1
$$;
revoke execute on function app.fila_auditada(text, text) from public, anon, authenticated;

-- Tablas que nunca se muestran en la consulta de auditoría (privadas de cada persona).
create function app.tabla_privada(p_tabla text) returns boolean
language sql immutable set search_path = '' as $$
  select p_tabla in ('tareas', 'tarea_avisos', 'etapas_tarea', 'borradores', 'notificaciones')
$$;

-- Contexto de una fila auditada: revisión, cotización, oportunidad y cliente a los que pertenece. Sigue la cadena
-- partida → propuesta → revisión → cotización → oportunidad → cliente con las tablas vigentes y, si el registro ya
-- se borró, con su último estado en la auditoría.
create function app.contexto_auditoria(
  p_tabla text,
  p_fila jsonb,
  out revision_id uuid,
  out cotizacion_id uuid,
  out oportunidad_id uuid,
  out cliente_id uuid
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_partida uuid;
  v_propuesta uuid;
  v_revision uuid;
  v_cotizacion uuid;
  v_oportunidad uuid;
  v_cliente uuid;
begin
  if p_fila is null then
    return;
  end if;
  case
    when p_tabla in ('partida_costos', 'partida_utilidad', 'partida_precios', 'partida_prorrateos') then
      v_partida := (p_fila ->> 'partida_id')::uuid;
    when p_tabla in ('partidas', 'propuesta_financiamientos') then
      v_propuesta := (p_fila ->> 'propuesta_id')::uuid;
    when p_tabla in ('propuestas', 'revision_condiciones', 'revision_tipos_cambio', 'solicitudes_cancelacion') then
      v_revision := (p_fila ->> 'revision_id')::uuid;
    when p_tabla = 'revisiones' then
      v_revision := (p_fila ->> 'id')::uuid;
      v_cotizacion := (p_fila ->> 'cotizacion_id')::uuid;
    when p_tabla = 'cotizaciones' then
      v_cotizacion := (p_fila ->> 'id')::uuid;
      v_oportunidad := (p_fila ->> 'oportunidad_id')::uuid;
    when p_tabla = 'oportunidades' then
      v_oportunidad := (p_fila ->> 'id')::uuid;
      v_cliente := (p_fila ->> 'cliente_id')::uuid;
    when p_tabla in ('seguimiento', 'oportunidad_colaboradores') then
      v_oportunidad := (p_fila ->> 'oportunidad_id')::uuid;
    when p_tabla = 'clientes' then
      v_cliente := (p_fila ->> 'id')::uuid;
    when p_tabla = 'contactos' then
      v_cliente := (p_fila ->> 'cliente_id')::uuid;
    else
      null;
  end case;

  if v_partida is not null then
    select pa.propuesta_id into v_propuesta from public.partidas pa where pa.id = v_partida;
    if v_propuesta is null then
      v_propuesta := (app.fila_auditada('partidas', v_partida::text) ->> 'propuesta_id')::uuid;
    end if;
  end if;
  if v_propuesta is not null and v_revision is null then
    select pr.revision_id into v_revision from public.propuestas pr where pr.id = v_propuesta;
    if v_revision is null then
      v_revision := (app.fila_auditada('propuestas', v_propuesta::text) ->> 'revision_id')::uuid;
    end if;
  end if;
  if v_revision is not null and v_cotizacion is null then
    select r.cotizacion_id into v_cotizacion from public.revisiones r where r.id = v_revision;
    if v_cotizacion is null then
      v_cotizacion := (app.fila_auditada('revisiones', v_revision::text) ->> 'cotizacion_id')::uuid;
    end if;
  end if;
  if v_cotizacion is not null and v_oportunidad is null then
    select c.oportunidad_id into v_oportunidad from public.cotizaciones c where c.id = v_cotizacion;
    if v_oportunidad is null then
      v_oportunidad := (app.fila_auditada('cotizaciones', v_cotizacion::text) ->> 'oportunidad_id')::uuid;
    end if;
  end if;
  if v_oportunidad is not null and v_cliente is null then
    select o.cliente_id into v_cliente from public.oportunidades o where o.id = v_oportunidad;
    if v_cliente is null then
      v_cliente := (app.fila_auditada('oportunidades', v_oportunidad::text) ->> 'cliente_id')::uuid;
    end if;
  end if;

  revision_id := v_revision;
  cotizacion_id := v_cotizacion;
  oportunidad_id := v_oportunidad;
  cliente_id := v_cliente;
end $$;
revoke execute on function app.contexto_auditoria(text, jsonb) from public, anon, authenticated;

-- «Partida 2 · SKU» para las filas de costo, utilidad, precio y prorrateo (que sólo traen el id de la partida).
create function app.etiqueta_partida(p_partida text) returns text
language sql stable security definer set search_path = '' as $$
  select concat_ws(' · ', 'Partida ' || (f ->> 'orden'), nullif(f ->> 'sku', ''))
  from (
    select coalesce(
      (select to_jsonb(pa) from public.partidas pa where pa.id::text = p_partida),
      app.fila_auditada('partidas', p_partida)
    ) as f
  ) x
  where f is not null
$$;
revoke execute on function app.etiqueta_partida(text) from public, anon, authenticated;

-- Acciones delicadas (etiqueta «Sensible»): usuarios, roles y permisos, configuración, cancelaciones, revisiones o
-- cotizaciones eliminadas y reasignación de una oportunidad.
create function app.es_sensible(p_tabla text, p_accion text, p_antes jsonb, p_despues jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select p_tabla in ('perfiles', 'roles', 'rol_permisos', 'configuracion', 'solicitudes_cancelacion')
    or (p_tabla in ('revisiones', 'cotizaciones') and p_accion = 'DELETE')
    or (p_tabla = 'revisiones' and p_antes ->> 'cancelada_en' is null and p_despues ->> 'cancelada_en' is not null)
    or (p_tabla = 'oportunidades' and p_accion = 'UPDATE'
        and p_antes ->> 'ejecutivo_id' is distinct from p_despues ->> 'ejecutivo_id')
$$;

-- Filas auditadas con su contexto y los nombres para mostrarlas (base de las tres consultas).
create function app.auditoria_con_contexto(p_desde timestamptz, p_hasta timestamptz)
returns table (
  id bigint,
  en timestamptz,
  usuario_id uuid,
  usuario text,
  tabla text,
  registro_id text,
  accion text,
  antes jsonb,
  despues jsonb,
  revision_id uuid,
  revision_numero int,
  cotizacion_id uuid,
  folio text,
  oportunidad_id uuid,
  oportunidad text,
  cliente_id uuid,
  cliente text,
  etiqueta text,
  sensible boolean
)
language sql stable security definer set search_path = '' as $$
  select
    a.id,
    a.en,
    a.usuario_id,
    pe.nombre,
    a.tabla,
    a.registro_id,
    a.accion,
    a.antes,
    a.despues,
    ctx.revision_id,
    coalesce(r.numero, (app.fila_auditada('revisiones', ctx.revision_id::text) ->> 'numero')::int),
    ctx.cotizacion_id,
    coalesce(c.folio, app.fila_auditada('cotizaciones', ctx.cotizacion_id::text) ->> 'folio'),
    ctx.oportunidad_id,
    coalesce(o.nombre, app.fila_auditada('oportunidades', ctx.oportunidad_id::text) ->> 'nombre'),
    ctx.cliente_id,
    coalesce(cl.razon_social, app.fila_auditada('clientes', ctx.cliente_id::text) ->> 'razon_social'),
    case
      when a.tabla in ('partida_costos', 'partida_utilidad', 'partida_precios', 'partida_prorrateos')
        then app.etiqueta_partida(coalesce(a.despues, a.antes) ->> 'partida_id')
    end,
    app.es_sensible(a.tabla, a.accion, a.antes, a.despues)
  from public.auditoria a
  cross join lateral app.contexto_auditoria(a.tabla, coalesce(a.despues, a.antes)) ctx
  left join public.perfiles pe on pe.id = a.usuario_id
  left join public.revisiones r on r.id = ctx.revision_id
  left join public.cotizaciones c on c.id = ctx.cotizacion_id
  left join public.oportunidades o on o.id = ctx.oportunidad_id
  left join public.clientes cl on cl.id = ctx.cliente_id
  where not app.tabla_privada(a.tabla)
    and (p_desde is null or a.en >= p_desde)
    and (p_hasta is null or a.en < p_hasta)
$$;
revoke execute on function app.auditoria_con_contexto(timestamptz, timestamptz) from public, anon, authenticated;

create function app.exigir_auditoria() returns void
language plpgsql stable set search_path = '' as $$
begin
  if not app.tiene_permiso('auditoria.ver') then
    raise exception 'No tienes permiso para consultar la auditoría' using errcode = '42501';
  end if;
end $$;

-- Cambios agrupados por acción (transacción), del más reciente al más antiguo. Filtros (todos opcionales):
--   desde, hasta, antes_de (paginación: acciones anteriores a esa hora), usuario (uuid), tablas (arreglo de nombres),
--   sensible (true: sólo acciones con algo sensible), texto (folio, cliente, oportunidad, persona o valores), cotizacion, oportunidad, cliente, perfil (uuid).
-- `limite` cuenta acciones, no filas.
create function public.auditoria_eventos(filtros jsonb default '{}', limite int default 60)
returns table (
  id bigint,
  en timestamptz,
  usuario_id uuid,
  usuario text,
  tabla text,
  registro_id text,
  accion text,
  antes jsonb,
  despues jsonb,
  revision_id uuid,
  revision_numero int,
  cotizacion_id uuid,
  folio text,
  oportunidad_id uuid,
  oportunidad text,
  cliente_id uuid,
  cliente text,
  etiqueta text,
  sensible boolean
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  f jsonb := coalesce(filtros, '{}');
  v_texto text := nullif(trim(f ->> 'texto'), '');
  v_tablas text[] := case when jsonb_typeof(f -> 'tablas') = 'array'
    then array(select jsonb_array_elements_text(f -> 'tablas')) end;
  v_hasta timestamptz := least((f ->> 'hasta')::timestamptz, (f ->> 'antes_de')::timestamptz);
begin
  perform app.exigir_auditoria();
  return query
  with base as (
    select * from app.auditoria_con_contexto((f ->> 'desde')::timestamptz, v_hasta)
  ),
  grupos as (
    select b.en as g_en, b.usuario_id as g_usuario
    from base b
    group by b.en, b.usuario_id
    having (f ->> 'usuario' is null or b.usuario_id = (f ->> 'usuario')::uuid)
      and (v_tablas is null or bool_or(b.tabla = any (v_tablas)))
      and (f ->> 'cotizacion' is null or bool_or(b.cotizacion_id = (f ->> 'cotizacion')::uuid))
      and (f ->> 'oportunidad' is null or bool_or(b.oportunidad_id = (f ->> 'oportunidad')::uuid))
      and (f ->> 'cliente' is null or bool_or(b.cliente_id = (f ->> 'cliente')::uuid))
      and (coalesce((f ->> 'sensible')::boolean, false) = false or bool_or(b.sensible))
      and (f ->> 'perfil' is null or bool_or(b.tabla = 'perfiles' and b.registro_id = f ->> 'perfil'))
      and (
        v_texto is null
        or bool_or(
          concat_ws(' ', b.folio, b.cliente, b.oportunidad, b.usuario, b.etiqueta, b.antes::text, b.despues::text)
            ilike '%' || v_texto || '%'
        )
      )
    order by b.en desc
    limit greatest(1, least(coalesce(limite, 60), 200))
  )
  select b.*
  from base b
  join grupos g on g.g_en = b.en and g.g_usuario is not distinct from b.usuario_id
  order by b.en desc, b.id;
end $$;
revoke execute on function public.auditoria_eventos(jsonb, int) from public, anon;
grant execute on function public.auditoria_eventos(jsonb, int) to authenticated;

-- Expedientes: cotizaciones, oportunidades, clientes y usuarios con sus eventos (acciones) y la fecha del último.
create function public.auditoria_expedientes(texto text default null)
returns table (tipo text, id uuid, titulo text, detalle text, eventos int, ultimo timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_texto text := nullif(trim(texto), '');
begin
  perform app.exigir_auditoria();
  return query
  with base as (select * from app.auditoria_con_contexto(null, null)),
  todos as (
    select 'cotizacion'::text as tipo, b.cotizacion_id as id,
      coalesce(max(b.folio), 'Cotización sin folio') as titulo,
      concat_ws(' · ', max(b.cliente), max(b.oportunidad),
        count(distinct b.revision_id) || case when count(distinct b.revision_id) = 1 then ' revisión' else ' revisiones' end
      ) as detalle,
      count(distinct (b.en, b.usuario_id))::int as eventos, max(b.en) as ultimo
    from base b where b.cotizacion_id is not null group by b.cotizacion_id
    union all
    select 'oportunidad', b.oportunidad_id, coalesce(max(b.oportunidad), 'Oportunidad'), max(b.cliente),
      count(distinct (b.en, b.usuario_id))::int, max(b.en)
    from base b where b.oportunidad_id is not null group by b.oportunidad_id
    union all
    select 'cliente', b.cliente_id, coalesce(max(b.cliente), 'Cliente'), null,
      count(distinct (b.en, b.usuario_id))::int, max(b.en)
    from base b where b.cliente_id is not null group by b.cliente_id
    union all
    select 'usuario', b.registro_id::uuid,
      coalesce(max(pe.nombre), 'Usuario'), max(ro.nombre),
      count(distinct (b.en, b.usuario_id))::int, max(b.en)
    from base b
    left join public.perfiles pe on pe.id::text = b.registro_id
    left join public.roles ro on ro.id = pe.rol_id
    where b.tabla = 'perfiles'
    group by b.registro_id
  )
  select t.tipo, t.id, t.titulo, t.detalle, t.eventos, t.ultimo
  from todos t
  where v_texto is null or concat_ws(' ', t.titulo, t.detalle) ilike '%' || v_texto || '%'
  order by t.ultimo desc
  limit 80;
end $$;
revoke execute on function public.auditoria_expedientes(text) from public, anon;
grant execute on function public.auditoria_expedientes(text) to authenticated;

-- Quita de una fila lo que la persona no puede ver.
create function app.sin_sensibles(p_fila jsonb, p_utilidad boolean, p_costos boolean) returns jsonb
language sql immutable set search_path = '' as $$
  select case
    when p_fila is null then null
    else p_fila
      - case when p_utilidad then '{}'::text[] else array['utilidad_pct', 'transaccion_pct', 'transaccion_alcance'] end
      - case when p_costos then '{}'::text[] else array['costo_unitario', 'costo_anterior', 'mayorista_id'] end
  end
$$;

-- Historial de una cotización para quien tiene acceso a ella. Lo sensible se omite: la utilidad y la
-- transaccionalidad sin utilidad.ver, los costos sin costos.ver; un cambio que sólo tocaba eso desaparece.
create function public.historial_cotizacion(cotizacion uuid)
returns table (
  id bigint,
  en timestamptz,
  usuario_id uuid,
  usuario text,
  tabla text,
  registro_id text,
  accion text,
  antes jsonb,
  despues jsonb,
  revision_id uuid,
  revision_numero int,
  cotizacion_id uuid,
  folio text,
  oportunidad_id uuid,
  oportunidad text,
  cliente_id uuid,
  cliente text,
  etiqueta text,
  sensible boolean
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_cotizacion uuid := cotizacion;
  v_utilidad boolean := app.tiene_permiso('utilidad.ver');
  v_costos boolean := app.tiene_permiso('costos.ver');
begin
  if v_cotizacion is null or not app.puede_ver_oportunidad(app.oportunidad_de_cotizacion(v_cotizacion)) then
    raise exception 'No tienes acceso a esta cotización' using errcode = '42501';
  end if;
  return query
  select b.id, b.en, b.usuario_id, b.usuario, b.tabla, b.registro_id, b.accion,
    app.sin_sensibles(b.antes, v_utilidad, v_costos),
    app.sin_sensibles(b.despues, v_utilidad, v_costos),
    b.revision_id, b.revision_numero, b.cotizacion_id, b.folio, b.oportunidad_id, b.oportunidad,
    b.cliente_id, b.cliente, b.etiqueta, b.sensible
  from app.auditoria_con_contexto(null, null) b
  where b.cotizacion_id = v_cotizacion
    and (v_utilidad or b.tabla <> 'partida_utilidad')
    and (v_costos or b.tabla <> 'partida_costos')
    and (
      b.accion <> 'UPDATE'
      or app.sin_sensibles(b.antes, v_utilidad, v_costos) is distinct from app.sin_sensibles(b.despues, v_utilidad, v_costos)
    )
  order by b.en desc, b.id;
end $$;
revoke execute on function public.historial_cotizacion(uuid) from public, anon;
grant execute on function public.historial_cotizacion(uuid) to authenticated;
