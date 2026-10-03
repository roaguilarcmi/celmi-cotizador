-- 0002 · Seguridad: permisos por rol y reglas de acceso por fila (RLS) en todas las tablas.
-- Decisiones confirmadas (2026-10-03):
--   · 2FA obligatoria para todos: sin sesión aal2 no se lee ni se escribe nada.
--   · Un ejecutivo ve sólo sus oportunidades (y aquellas donde colabora); el administrador ve todas.
--   · Ejecutivos y Cotizador ven costos; la utilidad sólo quien autoriza.

grant usage on schema app to authenticated;

-- ───────────── Funciones de apoyo (security definer: consultan sin pasar por RLS) ─────────────

-- Sesión válida = usuario con perfil activo y segundo factor verificado (aal2).
create function app.sesion_valida() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (select 1 from public.perfiles p where p.id = auth.uid() and p.activo)
$$;

create function app.tiene_permiso(permiso text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.sesion_valida() and exists (
    select 1
    from public.perfiles p
    join public.rol_permisos rp on rp.rol_id = p.rol_id
    where p.id = auth.uid() and rp.permiso_id = permiso
  )
$$;

create function app.es_participante(oportunidad uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.oportunidades o where o.id = oportunidad and o.ejecutivo_id = auth.uid())
      or exists (
        select 1 from public.oportunidad_colaboradores c
        where c.oportunidad_id = oportunidad and c.perfil_id = auth.uid()
      )
$$;

create function app.puede_ver_oportunidad(oportunidad uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.sesion_valida()
     and (app.tiene_permiso('oportunidades.ver_todas') or app.es_participante(oportunidad))
$$;

create function app.puede_editar_oportunidad(oportunidad uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.sesion_valida()
     and (app.tiene_permiso('oportunidades.editar_todas') or app.es_participante(oportunidad))
$$;

-- Navegación partida → propuesta → revisión → cotización → oportunidad.
create function app.oportunidad_de_cotizacion(cotizacion uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select c.oportunidad_id from public.cotizaciones c where c.id = cotizacion
$$;

create function app.oportunidad_de_revision(revision uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select c.oportunidad_id
  from public.revisiones r join public.cotizaciones c on c.id = r.cotizacion_id
  where r.id = revision
$$;

create function app.revision_de_partida(partida uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select pr.revision_id
  from public.partidas pa join public.propuestas pr on pr.id = pa.propuesta_id
  where pa.id = partida
$$;

-- Una revisión autorizada o emitida queda bloqueada: el ejecutivo ya no cambia partidas ni costos (RFP §12).
create function app.revision_bloqueada(revision uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select r.estado in ('autorizada', 'emitida') from public.revisiones r where r.id = revision),
    false
  )
$$;

-- ¿Puede modificar el contenido de esta revisión? Participante o administrador, y sin bloqueo
-- (salvo permiso de autorizar modificaciones posteriores).
create function app.puede_modificar_revision(revision uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.puede_editar_oportunidad(app.oportunidad_de_revision(revision))
     and (not app.revision_bloqueada(revision) or app.tiene_permiso('modificaciones.autorizar'))
$$;

grant execute on all functions in schema app to authenticated;

-- ───────────── Privilegios: anon no ve nada; authenticated queda sujeto a RLS ─────────────
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.folios, public.accesos from authenticated;
revoke select on public.folios from authenticated;

alter table public.roles enable row level security;
alter table public.permisos enable row level security;
alter table public.rol_permisos enable row level security;
alter table public.perfiles enable row level security;
alter table public.configuracion enable row level security;
alter table public.monedas enable row level security;
alter table public.unidades enable row level security;
alter table public.mayoristas enable row level security;
alter table public.marcas enable row level security;
alter table public.estados_oportunidad enable row level security;
alter table public.esquemas_adquisicion enable row level security;
alter table public.clientes enable row level security;
alter table public.contactos enable row level security;
alter table public.oportunidades enable row level security;
alter table public.oportunidad_colaboradores enable row level security;
alter table public.cotizaciones enable row level security;
alter table public.folios enable row level security;
alter table public.revisiones enable row level security;
alter table public.propuestas enable row level security;
alter table public.partidas enable row level security;
alter table public.partida_costos enable row level security;
alter table public.partida_utilidad enable row level security;
alter table public.partida_precios enable row level security;
alter table public.accesos enable row level security;

-- ───────────── Usuarios, roles y configuración ─────────────
create policy perfiles_ver on public.perfiles for select to authenticated using (app.sesion_valida());
create policy perfiles_alta on public.perfiles for insert to authenticated
  with check (app.tiene_permiso('usuarios.administrar'));
create policy perfiles_editar on public.perfiles for update to authenticated
  using (app.tiene_permiso('usuarios.administrar')) with check (app.tiene_permiso('usuarios.administrar'));

create policy roles_ver on public.roles for select to authenticated using (app.sesion_valida());
create policy roles_admin on public.roles for all to authenticated
  using (app.tiene_permiso('usuarios.administrar')) with check (app.tiene_permiso('usuarios.administrar'));
create policy permisos_ver on public.permisos for select to authenticated using (app.sesion_valida());
create policy rol_permisos_ver on public.rol_permisos for select to authenticated using (app.sesion_valida());
create policy rol_permisos_admin on public.rol_permisos for all to authenticated
  using (app.tiene_permiso('usuarios.administrar')) with check (app.tiene_permiso('usuarios.administrar'));

create policy configuracion_ver on public.configuracion for select to authenticated using (app.sesion_valida());
create policy configuracion_admin on public.configuracion for all to authenticated
  using (app.tiene_permiso('catalogos.administrar')) with check (app.tiene_permiso('catalogos.administrar'));

-- Cada quien guarda sus propias preferencias visuales sin poder tocar el resto de su perfil.
create function public.guardar_mis_preferencias(preferencias jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.sesion_valida() then
    raise exception 'Sesión no válida' using errcode = '42501';
  end if;
  if jsonb_typeof(preferencias) <> 'object' then
    raise exception 'Las preferencias deben ser un objeto JSON' using errcode = '22023';
  end if;
  update public.perfiles set preferencias = guardar_mis_preferencias.preferencias where id = auth.uid();
end $$;
revoke execute on function public.guardar_mis_preferencias(jsonb) from public, anon;
grant execute on function public.guardar_mis_preferencias(jsonb) to authenticated;

-- ───────────── Catálogos: todos los leen, el administrador los edita ─────────────
do $$
declare t text;
begin
  foreach t in array array['monedas', 'unidades', 'mayoristas', 'marcas', 'estados_oportunidad', 'esquemas_adquisicion']
  loop
    execute format(
      'create policy %1$s_ver on public.%1$I for select to authenticated using (app.sesion_valida())', t);
    execute format(
      'create policy %1$s_admin on public.%1$I for all to authenticated
         using (app.tiene_permiso(''catalogos.administrar''))
         with check (app.tiene_permiso(''catalogos.administrar''))', t);
  end loop;
end $$;

-- ───────────── Clientes ─────────────
create policy clientes_ver on public.clientes for select to authenticated using (app.tiene_permiso('clientes.ver'));
create policy clientes_alta on public.clientes for insert to authenticated
  with check (app.tiene_permiso('clientes.crear'));
create policy clientes_editar on public.clientes for update to authenticated
  using (app.tiene_permiso('clientes.editar')) with check (app.tiene_permiso('clientes.editar'));

create policy contactos_ver on public.contactos for select to authenticated using (app.tiene_permiso('clientes.ver'));
create policy contactos_alta on public.contactos for insert to authenticated
  with check (app.tiene_permiso('clientes.crear') or app.tiene_permiso('clientes.editar'));
create policy contactos_editar on public.contactos for update to authenticated
  using (app.tiene_permiso('clientes.editar')) with check (app.tiene_permiso('clientes.editar'));

-- ───────────── Oportunidades ─────────────
create policy oportunidades_ver on public.oportunidades for select to authenticated
  using (app.puede_ver_oportunidad(id));
-- Un ejecutivo sólo crea oportunidades a su nombre; el administrador puede asignarlas a otro.
create policy oportunidades_alta on public.oportunidades for insert to authenticated
  with check (
    app.tiene_permiso('oportunidades.crear')
    and (ejecutivo_id = auth.uid() or app.tiene_permiso('oportunidades.editar_todas'))
  );
create policy oportunidades_editar on public.oportunidades for update to authenticated
  using (app.puede_editar_oportunidad(id))
  with check (
    app.puede_editar_oportunidad(id)
    and (ejecutivo_id = auth.uid() or app.tiene_permiso('oportunidades.editar_todas') or app.es_participante(id))
  );

create policy colaboradores_ver on public.oportunidad_colaboradores for select to authenticated
  using (app.puede_ver_oportunidad(oportunidad_id));
create policy colaboradores_alta on public.oportunidad_colaboradores for insert to authenticated
  with check (app.puede_editar_oportunidad(oportunidad_id));
create policy colaboradores_baja on public.oportunidad_colaboradores for delete to authenticated
  using (app.puede_editar_oportunidad(oportunidad_id));

-- ───────────── Cotizaciones y revisiones ─────────────
create policy cotizaciones_ver on public.cotizaciones for select to authenticated
  using (app.puede_ver_oportunidad(oportunidad_id));
-- El folio no se captura: sólo lo asigna public.asignar_folio().
create policy cotizaciones_alta on public.cotizaciones for insert to authenticated
  with check (app.puede_editar_oportunidad(oportunidad_id) and folio is null);

create policy revisiones_ver on public.revisiones for select to authenticated
  using (app.puede_ver_oportunidad(app.oportunidad_de_cotizacion(cotizacion_id)));
create policy revisiones_alta on public.revisiones for insert to authenticated
  with check (
    app.puede_editar_oportunidad(app.oportunidad_de_cotizacion(cotizacion_id))
    and estado = 'borrador'
  );
-- Quien prepara la cotización sólo puede mover la revisión entre borrador y pendiente;
-- autorizar, rechazar o emitir requiere el permiso de autorización.
create policy revisiones_editar on public.revisiones for update to authenticated
  using (app.puede_modificar_revision(id) or app.tiene_permiso('utilidad.autorizar'))
  with check (
    app.tiene_permiso('utilidad.autorizar')
    or (app.puede_modificar_revision(id) and estado in ('borrador', 'pendiente_autorizacion'))
  );

-- ───────────── Propuestas y partidas ─────────────
create policy propuestas_ver on public.propuestas for select to authenticated
  using (app.puede_ver_oportunidad(app.oportunidad_de_revision(revision_id)));
create policy propuestas_alta on public.propuestas for insert to authenticated
  with check (app.puede_modificar_revision(revision_id));
create policy propuestas_editar on public.propuestas for update to authenticated
  using (app.puede_modificar_revision(revision_id)) with check (app.puede_modificar_revision(revision_id));
create policy propuestas_baja on public.propuestas for delete to authenticated
  using (app.puede_modificar_revision(revision_id));

create policy partidas_ver on public.partidas for select to authenticated
  using (app.puede_ver_oportunidad(app.oportunidad_de_revision(
    (select pr.revision_id from public.propuestas pr where pr.id = propuesta_id))));
create policy partidas_alta on public.partidas for insert to authenticated
  with check (app.puede_modificar_revision((select pr.revision_id from public.propuestas pr where pr.id = propuesta_id)));
create policy partidas_editar on public.partidas for update to authenticated
  using (app.puede_modificar_revision(app.revision_de_partida(id)))
  with check (app.puede_modificar_revision((select pr.revision_id from public.propuestas pr where pr.id = propuesta_id)));
create policy partidas_baja on public.partidas for delete to authenticated
  using (app.puede_modificar_revision(app.revision_de_partida(id)));

-- Costos: permiso costos.ver además del acceso a la oportunidad.
create policy costos_ver on public.partida_costos for select to authenticated
  using (
    app.tiene_permiso('costos.ver')
    and app.puede_ver_oportunidad(app.oportunidad_de_revision(app.revision_de_partida(partida_id)))
  );
create policy costos_alta on public.partida_costos for insert to authenticated
  with check (app.tiene_permiso('costos.ver') and app.puede_modificar_revision(app.revision_de_partida(partida_id)));
create policy costos_editar on public.partida_costos for update to authenticated
  using (app.tiene_permiso('costos.ver') and app.puede_modificar_revision(app.revision_de_partida(partida_id)))
  with check (app.tiene_permiso('costos.ver') and app.puede_modificar_revision(app.revision_de_partida(partida_id)));

-- Utilidad: sólo quien autoriza la ve y la define.
create policy utilidad_ver on public.partida_utilidad for select to authenticated
  using (app.tiene_permiso('utilidad.ver'));
create policy utilidad_definir on public.partida_utilidad for all to authenticated
  using (app.tiene_permiso('utilidad.autorizar')) with check (app.tiene_permiso('utilidad.autorizar'));

-- Precio de venta: lo ve quien ve la oportunidad; sólo quien autoriza lo registra.
create policy precios_ver on public.partida_precios for select to authenticated
  using (app.puede_ver_oportunidad(app.oportunidad_de_revision(app.revision_de_partida(partida_id))));
create policy precios_definir on public.partida_precios for all to authenticated
  using (app.tiene_permiso('utilidad.autorizar')) with check (app.tiene_permiso('utilidad.autorizar'));

-- ───────────── Accesos ─────────────
create policy accesos_ver on public.accesos for select to authenticated
  using (app.tiene_permiso('auditoria.ver'));

-- ───────────── Folio: consecutivo anual sin repetir, aun con emisiones simultáneas ─────────────
create function app.asignar_folio_en(cotizacion uuid, anio int) returns text
language plpgsql security definer set search_path = '' as $$
declare
  cfg jsonb;
  consecutivo int;
  nuevo text;
begin
  if exists (select 1 from public.cotizaciones c where c.id = cotizacion and c.folio is not null) then
    raise exception 'La cotización ya tiene folio' using errcode = '23505';
  end if;
  select valor into cfg from public.configuracion where clave = 'folio';
  -- INSERT … ON CONFLICT bloquea la fila del año: dos emisiones simultáneas nunca obtienen el mismo número.
  insert into public.folios (anio, ultimo) values (anio, 1)
  on conflict on constraint folios_pkey do update set ultimo = public.folios.ultimo + 1
  returning ultimo into consecutivo;
  if consecutivo >= 10 ^ (cfg ->> 'digitos')::int then
    raise exception 'Se agotaron los folios del año %', anio;
  end if;
  nuevo := (cfg ->> 'prefijo') || '-' || anio || lpad(consecutivo::text, (cfg ->> 'digitos')::int, '0');
  update public.cotizaciones
  set folio = nuevo, folio_anio = anio, folio_consecutivo = consecutivo
  where id = cotizacion;
  return nuevo;
end $$;
revoke execute on function app.asignar_folio_en(uuid, int) from public, authenticated;

-- Punto de entrada para la aplicación. Cuándo se asigna (al crear o al emitir) sigue pendiente de definir.
create function public.asignar_folio(cotizacion uuid) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not app.puede_editar_oportunidad(app.oportunidad_de_cotizacion(cotizacion)) then
    raise exception 'Sin permiso para asignar folio' using errcode = '42501';
  end if;
  return app.asignar_folio_en(
    cotizacion,
    extract(year from (now() at time zone 'America/Mexico_City'))::int
  );
end $$;
revoke execute on function public.asignar_folio(uuid) from public, anon;
grant execute on function public.asignar_folio(uuid) to authenticated;
