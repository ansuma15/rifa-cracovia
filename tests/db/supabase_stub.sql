-- =====================================================================
-- SOLO PARA PRUEBAS LOCALES / CI. NUNCA ejecutar en el proyecto Supabase.
-- Reproduce lo mínimo de Supabase que usan las migraciones:
--   roles anon/authenticated/service_role, esquema auth con auth.uid()
--   y auth.jwt() (misma implementación que Supabase: leen el GUC
--   request.jwt.claims), esquema extensions y la publicación de Realtime.
-- También reproduce los privilegios por defecto "generosos" de Supabase
-- para comprobar que nuestras migraciones los revocan correctamente.
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

create schema if not exists extensions;
grant usage on schema extensions to public;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamptz not null default now()
);

-- Mismas definiciones que usa Supabase (incluido el GUC antiguo request.jwt.claim.*)
create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb;
$$;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;

grant execute on function auth.jwt(), auth.uid() to public;

grant usage on schema public to anon, authenticated, service_role;

-- Privilegios por defecto equivalentes a los de un proyecto Supabase nuevo.
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;
