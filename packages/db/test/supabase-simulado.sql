-- Reproduce lo mínimo de Supabase que usan las migraciones, para probarlas en PGlite (PostgreSQL en memoria):
-- roles de la API, el esquema auth y las funciones auth.uid() / auth.jwt(), que en Supabase leen el token
-- de la sesión desde request.jwt.claims.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text not null
);

create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
