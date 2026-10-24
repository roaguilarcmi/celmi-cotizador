-- 0036 · Solicitud de corrida financiera (2026-10-23; mockups aprobados por Rodrigo).
--
-- Paso nuevo entre «Autorización» y «Financiamiento» (arrendamiento y crédito simple): con lo autorizado se llena el
-- formato del mayorista del arrendamiento (CT, Ingram o el formato propio de CELMI) para pedir la corrida por correo.
--   1. `mayoristas.formato_arrendamiento`: qué formato usa cada mayorista (null = formato de CELMI).
--   2. `categorias_producto`: la categoría de cada número de parte (Ingram la pide); se sugiere por la descripción,
--      se corrige en el paso y se recuerda para la próxima vez.
--   3. `solicitudes_corrida`: registro de cada formato generado (quién, cuándo, plazos, esquemas y presentación).
-- Los archivos no se guardan: se generan al descargarlos con los datos autorizados.

-- ───────────── 1. Formato por mayorista ─────────────

alter table public.mayoristas add column formato_arrendamiento text
  check (formato_arrendamiento in ('ct', 'ingram'));
update public.mayoristas set formato_arrendamiento = 'ct'
  where formato_arrendamiento is null and (nombre ~* '^\s*ct\M' or nombre ilike '%ct internacional%');
update public.mayoristas set formato_arrendamiento = 'ingram'
  where formato_arrendamiento is null and nombre ilike '%ingram%';

-- ───────────── 2. Categoría de cada número de parte ─────────────

create table public.categorias_producto (
  sku text primary key check (sku = upper(btrim(sku)) and length(sku) between 1 and 80),
  categoria text not null check (length(btrim(categoria)) between 1 and 60),
  actualizado_por uuid default auth.uid() references public.perfiles (id),
  actualizado_en timestamptz not null default now()
);

alter table public.categorias_producto enable row level security;
revoke all on public.categorias_producto from anon, authenticated;
grant select on public.categorias_producto to authenticated;
-- (sku en update: «insertar o actualizar» reescribe la llave con el mismo valor.)
grant insert (sku, categoria), update (sku, categoria) on public.categorias_producto to authenticated;
create policy categorias_ver on public.categorias_producto for select to authenticated
  using (app.sesion_valida());
create policy categorias_alta on public.categorias_producto for insert to authenticated
  with check (app.tiene_permiso('costos.ver'));
create policy categorias_editar on public.categorias_producto for update to authenticated
  using (app.tiene_permiso('costos.ver')) with check (app.tiene_permiso('costos.ver'));

-- Quién y cuándo los pone la base (no se pueden falsear desde la app).
create function app.sellar_categoria() returns trigger
language plpgsql set search_path = '' as $f$
begin
  new.actualizado_por := auth.uid();
  new.actualizado_en := now();
  return new;
end $f$;
create trigger sellar before insert or update on public.categorias_producto
  for each row execute function app.sellar_categoria();

create trigger auditar after insert or update on public.categorias_producto
  for each row execute function app.auditar();

-- ───────────── 3. Registro de solicitudes generadas ─────────────

create table public.solicitudes_corrida (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.revisiones (id) on delete cascade,
  propuesta_id uuid not null references public.propuestas (id) on delete cascade,
  mayorista_id uuid references public.mayoristas (id),
  formato text not null check (formato in ('ct', 'ingram', 'celmi')),
  plazos int[] not null check (cardinality(plazos) between 1 and 4 and plazos <@ array[24, 36, 48, 60]),
  esquemas text[] not null check (cardinality(esquemas) between 1 and 2 and esquemas <@ array['vjm', 'fpo', 'credito']),
  presentacion text not null check (presentacion in ('cliente', 'desglosada')),
  generada_por uuid not null default auth.uid() references public.perfiles (id),
  generada_en timestamptz not null default now()
);
create index solicitudes_corrida_revision on public.solicitudes_corrida (revision_id, generada_en desc);

alter table public.solicitudes_corrida enable row level security;
revoke all on public.solicitudes_corrida from anon, authenticated;
grant select on public.solicitudes_corrida to authenticated;
grant insert (revision_id, propuesta_id, mayorista_id, formato, plazos, esquemas, presentacion)
  on public.solicitudes_corrida to authenticated;
create policy solicitudes_corrida_ver on public.solicitudes_corrida for select to authenticated
  using (app.puede_ver_oportunidad(app.oportunidad_de_revision(revision_id)));
-- Lleva costos: sólo quien los ve, con acceso a la cotización, sobre una revisión autorizada o emitida.
create policy solicitudes_corrida_alta on public.solicitudes_corrida for insert to authenticated
  with check (
    app.tiene_permiso('costos.ver')
    and app.puede_ver_oportunidad(app.oportunidad_de_revision(revision_id))
    and generada_por = auth.uid()
    and exists (
      select 1 from public.revisiones r join public.propuestas p on p.revision_id = r.id
      where r.id = solicitudes_corrida.revision_id and p.id = solicitudes_corrida.propuesta_id
        and r.estado in ('autorizada', 'emitida')
    )
  );

create trigger auditar after insert on public.solicitudes_corrida
  for each row execute function app.auditar();

-- La auditoría ubica las solicitudes en su cotización (mismo cuerpo que 0034, con la tabla nueva).
create or replace function app.contexto_auditoria(
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
    when p_tabla in ('propuestas', 'revision_condiciones', 'revision_tipos_cambio', 'solicitudes_cancelacion',
                     'solicitudes_corrida') then
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
