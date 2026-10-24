-- ============================================================================
-- Access control regression test.
--
-- Run this if you ever change the policies in schema.sql. It checks that a
-- collaborator sees what they should, that someone outside a project sees
-- nothing at all, and that nobody can quietly add themselves to a project.
--
-- Every write below is written the way the app writes it, as an insert or
-- update followed by reading the row back. That read back is the part that
-- matters: a policy can allow the write and still refuse to return the row,
-- which is what broke project creation the first time round.
--
-- Run it against a THROWAWAY database, not the live one. It inserts rows.
--
--   createdb pmtest
--   psql -d pmtest -f supabase/rls_test.sql    # the stub block runs first
--   psql -d pmtest -f supabase/schema.sql
--   psql -d pmtest -f supabase/rls_test.sql
--
-- Against a local Supabase (supabase start) the stub block is unnecessary,
-- because auth.users and auth.uid() already exist there.
-- ============================================================================

-- Stand-in for the parts of Supabase this schema touches, for plain Postgres.
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
-- Three people: an owner, a lab mate invited by email, and an outsider.
-- ----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@uiowa.edu'),
  ('33333333-3333-3333-3333-333333333333', 'outsider@elsewhere.org')
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- Creating a project, exactly as the app does it.
-- ----------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';

  select 'A. create_project returns the new row|' || (id is not null)::int || '|1'
    from create_project('Test project', 'FY26-001', 'A summary',
                        current_date, current_date + 120, 'Owner');

  select 'B. creator is a member of it|' || count(*) || '|1' from project_members;
  select 'C. that seat is an admin|'     || count(*) || '|1' from project_members where is_admin;
  select 'D. creator can read it back|'  || count(*) || '|1' from projects;
  select 'E. the rollup view shows it|'  || count(*) || '|1' from my_projects;

  -- An admin invites a collaborator by email, before they have an account.
  with x as (
    insert into project_members (project_id, invited_email, display_name, role)
    select id, 'labmate@uiowa.edu', 'Lab mate', 'Developer' from projects limit 1
    returning id)
  select 'F. invite a collaborator, read back|' || count(*) || '|1' from x;
commit;

-- ----------------------------------------------------------------------------
-- The inserts the app makes from inside a project, each read back.
-- ----------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';

  with x as (
    insert into tasks (project_id, title, end_date)
    select id, 'A task', current_date + 5 from projects limit 1 returning id)
  select 'G. add a task, read back|' || count(*) || '|1' from x;

  with x as (
    insert into milestones (project_id, title, due_date)
    select id, 'A milestone', current_date + 20 from projects limit 1 returning id)
  select 'H. add a milestone, read back|' || count(*) || '|1' from x;

  with x as (
    insert into risks (project_id, description, likelihood, severity)
    select id, 'A risk', 4, 4 from projects limit 1 returning id)
  select 'I. add a risk, read back|' || count(*) || '|1' from x;

  with x as (
    insert into updates (project_id, author_id, author_name, body)
    select id, '11111111-1111-1111-1111-111111111111', 'Owner', 'Reported.'
      from projects limit 1 returning id)
  select 'J. report progress, read back|' || count(*) || '|1' from x;

  with x as (
    insert into links (project_id, url, label, added_by)
    select id, 'https://example.org', 'Data',
           '11111111-1111-1111-1111-111111111111' from projects limit 1 returning id)
  select 'K. attach a link, read back|' || count(*) || '|1' from x;

  with x as (
    insert into raci_assignments (task_id, member_id, letter)
    select t.id, m.id, 'A' from tasks t, project_members m
     where m.user_id = '11111111-1111-1111-1111-111111111111' limit 1 returning id)
  select 'L. set a RACI cell, read back|' || count(*) || '|1' from x;

  with x as (
    insert into raci_assignments (task_id, member_id, letter)
    select t.id, m.id, 'R' from tasks t, project_members m
     where m.user_id = '11111111-1111-1111-1111-111111111111' limit 1
    on conflict (task_id, member_id) do update set letter = excluded.letter
    returning id)
  select 'M. change a RACI cell, read back|' || count(*) || '|1' from x;

  with x as (
    update tasks set status = 'done', pct_complete = 100, completed_at = now()
    returning id)
  select 'N. mark a task done, read back|' || count(*) || '|1' from x;
commit;

-- ----------------------------------------------------------------------------
-- The outsider must see nothing of someone else's project.
-- ----------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
  select 'O. outsider sees projects|' || count(*) || '|0' from projects;
  select 'P. outsider sees tasks|'    || count(*) || '|0' from tasks;
  select 'Q. outsider sees members|'  || count(*) || '|0' from project_members;
  select 'R. outsider sees updates|'  || count(*) || '|0' from updates;
  select 'S. outsider sees the view|' || count(*) || '|0' from my_projects;

  -- They may of course make their own, and must see only that one.
  select 'T. outsider can make their own|' || (id is not null)::int || '|1'
    from create_project('Outsider project');
  select 'U. and still sees only that one|' || count(*) || '|1' from projects;
commit;

-- ----------------------------------------------------------------------------
-- The lab mate signs in for the first time. The trigger should create their
-- profile and claim the seat waiting on their email address.
-- ----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('22222222-2222-2222-2222-222222222222', 'labmate@uiowa.edu')
on conflict do nothing;

select 'V. seat claimed at first sign in|' || count(*) || '|1'
  from project_members where user_id = '22222222-2222-2222-2222-222222222222';

begin;
  set local role authenticated;
  set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
  select 'W. member sees the project|' || count(*) || '|1'
    from projects where name = 'Test project';
  select 'X. member sees its tasks|' || count(*) || '|1' from tasks;

  with x as (
    insert into updates (project_id, author_id, author_name, body)
    select id, '22222222-2222-2222-2222-222222222222', 'Lab mate', 'Also reported.'
      from projects where name = 'Test project' returning id)
  select 'Y. member can report progress|' || count(*) || '|1' from x;

  with d as (
    delete from project_members where display_name = 'Owner' returning 1)
  select 'Z. member cannot remove an admin|' || count(*) || '|0' from d;
commit;

-- ----------------------------------------------------------------------------
-- The escalations that matter. Each must raise an error.
-- ----------------------------------------------------------------------------
-- The project id is captured here, outside any role change, because an
-- outsider cannot select it. Without that, the insert below would match zero
-- rows and pass without ever testing the policy.
select id as target_project from projects where name = 'Test project' \gset

\echo '--- AA. outsider adding themselves to a project (expect an error) ---'
begin;
  set local role authenticated;
  set local "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
  insert into project_members (project_id, user_id, display_name)
  values (:'target_project', '33333333-3333-3333-3333-333333333333', 'Outsider');
rollback;

\echo '--- AB. outsider creating a project owned by someone else (expect an error) ---'
begin;
  set local role authenticated;
  set local "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
  insert into projects (name, created_by) values
    ('Sneaky', '11111111-1111-1111-1111-111111111111');
rollback;

\echo '--- AC. nobody signed in calling create_project (expect an error) ---'
begin;
  set local role authenticated;
  select create_project('No session');
rollback;

-- Rows above print as "label|got|want". Anything where got and want differ is
-- a failure. AA, AB and AC must each print an error; silence there means the
-- policies have a hole.
