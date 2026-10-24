-- ============================================================================
-- Fix: creating a project failed with
--   new row violates row-level security policy for table "projects"
--
-- Creating a project used to be two steps from the browser: insert the
-- project, then insert the creator's membership row. Between those two steps
-- the creator is not yet a member of their own project, so the rule that says
-- "you may read a project you belong to" refused to return the row that had
-- just been written, and Postgres reported that as an insert violation.
--
-- Both steps now happen inside one function, in one transaction, so there is
-- no moment in between. Safe to run more than once.
-- ============================================================================

create or replace function create_project(
  p_name       text,
  p_code       text default null,
  p_summary    text default null,
  p_start      date default null,
  p_end        date default null,
  p_owner_name text default null
)
returns projects
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  proj projects;
begin
  if uid is null then
    raise exception 'You are not signed in' using errcode = '42501';
  end if;

  if coalesce(btrim(p_name), '') = '' then
    raise exception 'A project needs a name' using errcode = '22023';
  end if;

  insert into projects (name, code, summary, start_date, end_date, created_by)
  values (
    btrim(p_name),
    nullif(btrim(coalesce(p_code, '')), ''),
    nullif(btrim(coalesce(p_summary, '')), ''),
    p_start,
    p_end,
    uid
  )
  returning * into proj;

  -- The creator is the first member and an admin. Without this row the row
  -- level security rules would hide the project from its own author.
  insert into project_members (project_id, user_id, display_name, role, is_admin)
  values (
    proj.id,
    uid,
    coalesce(
      nullif(btrim(coalesce(p_owner_name, '')), ''),
      (select nullif(btrim(coalesce(full_name, '')), '') from profiles where id = uid),
      (select email from profiles where id = uid),
      'Me'
    ),
    'Project lead',
    true
  );

  return proj;
end;
$$;

revoke all     on function create_project(text, text, text, date, date, text) from public;
grant  execute on function create_project(text, text, text, date, date, text) to authenticated;

-- With creation handled by the function above, the roster is admins only and
-- the creator bootstrap clause is no longer needed.
drop policy if exists members_insert on project_members;
create policy members_insert on project_members
  for insert to authenticated
  with check (is_project_admin(project_id));

drop function if exists is_project_creator(uuid);
