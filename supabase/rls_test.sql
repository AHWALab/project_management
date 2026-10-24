-- ============================================================================
-- Access control regression test.
--
-- Run this if you ever change the policies in schema.sql. It checks that a
-- collaborator sees what they should, that someone outside a project sees
-- nothing at all, and that nobody can quietly add themselves to a project.
--
-- Run it against a THROWAWAY database, not the live one. It inserts rows.
--
--   createdb pmtest
--   psql -d pmtest -f supabase/schema_test_stub.sql   # see the block below
--   psql -d pmtest -f supabase/schema.sql
--   psql -d pmtest -f supabase/rls_test.sql
--
-- To run it against a local Supabase instead (supabase start), the stub is not
-- needed because auth.users and auth.uid() already exist there.
-- ============================================================================

-- Stand-in for the parts of Supabase this schema touches, for a plain Postgres.
-- Skip this block when running against a real Supabase database.
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
end $$;
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;

-- ----------------------------------------------------------------------------
-- Three people. Mohamed owns a project, a lab mate is invited to it, and an
-- outsider is on nothing.
-- ----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@uiowa.edu'),
  ('33333333-3333-3333-3333-333333333333', 'outsider@elsewhere.org')
on conflict do nothing;

begin;
  set local role authenticated;
  set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';

  insert into projects (id, name, created_by) values
    ('aaaaaaaa-0000-0000-0000-000000000001', 'Test project',
     '11111111-1111-1111-1111-111111111111');
  insert into project_members (project_id, user_id, display_name, is_admin) values
    ('aaaaaaaa-0000-0000-0000-000000000001',
     '11111111-1111-1111-1111-111111111111', 'Owner', true);
  insert into project_members (project_id, invited_email, display_name) values
    ('aaaaaaaa-0000-0000-0000-000000000001', 'labmate@uiowa.edu', 'Lab mate');
  insert into tasks (project_id, title, end_date) values
    ('aaaaaaaa-0000-0000-0000-000000000001', 'A task', current_date + 3);

  select 'A. creator bootstraps their own admin seat|' || count(*) || '|1' from project_members;
  select 'B. creator sees their project|'              || count(*) || '|1' from projects;
commit;

-- ----------------------------------------------------------------------------
-- The outsider must see nothing, anywhere.
-- ----------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
  select 'C. outsider sees projects|'   || count(*) || '|0' from projects;
  select 'D. outsider sees tasks|'      || count(*) || '|0' from tasks;
  select 'E. outsider sees the roster|' || count(*) || '|0' from project_members;
  select 'F. outsider sees the view|'   || count(*) || '|0' from my_projects;
commit;

-- ----------------------------------------------------------------------------
-- The lab mate signs in for the first time. The trigger should create their
-- profile and claim the seat that was waiting on their email address.
-- ----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('22222222-2222-2222-2222-222222222222', 'labmate@uiowa.edu')
on conflict do nothing;

select 'G. seat claimed at first sign in|' || count(*) || '|1'
  from project_members where user_id = '22222222-2222-2222-2222-222222222222';

begin;
  set local role authenticated;
  set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
  select 'H. member sees the project|' || count(*) || '|1' from projects;
  select 'I. member sees tasks|'       || count(*) || '|1' from tasks;

  insert into updates (project_id, author_id, author_name, body) values
    ('aaaaaaaa-0000-0000-0000-000000000001',
     '22222222-2222-2222-2222-222222222222', 'Lab mate', 'Reported something.');
  select 'J. member can report progress|' || count(*) || '|1' from updates;

  with d as (
    delete from project_members where display_name = 'Owner' returning 1
  )
  select 'K. member cannot remove an admin|' || count(*) || '|0' from d;
commit;

-- ----------------------------------------------------------------------------
-- The two escalations that matter. Both must raise an error.
-- ----------------------------------------------------------------------------
\echo '--- L. outsider adding themselves to a project (expect an error) ---'
begin;
  set local role authenticated;
  set local "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
  insert into project_members (project_id, user_id, display_name) values
    ('aaaaaaaa-0000-0000-0000-000000000001',
     '33333333-3333-3333-3333-333333333333', 'Outsider');
rollback;

\echo '--- M. outsider creating a project owned by someone else (expect an error) ---'
begin;
  set local role authenticated;
  set local "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
  insert into projects (name, created_by) values
    ('Sneaky', '11111111-1111-1111-1111-111111111111');
rollback;

-- Rows above print as "label|got|want". Anything where got and want differ is a
-- failure. L and M must each print an error; silence there means the policies
-- have a hole.
