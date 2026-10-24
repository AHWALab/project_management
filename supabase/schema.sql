-- ============================================================================
-- AHWA Lab project management
-- Run this once in the Supabase SQL editor (Dashboard > SQL Editor > New query).
-- Safe to re-run: every object is created with "if not exists" or replaced.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- People
-- ----------------------------------------------------------------------------
create table if not exists profiles (
  id          uuid primary key references auth.users on delete cascade,
  email       text not null,
  full_name   text,
  title       text,
  created_at  timestamptz not null default now()
);

-- A row in profiles appears automatically the first time someone signs in.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  -- Claim any seats that were created for this email before they signed up.
  update project_members
     set user_id = new.id
   where user_id is null
     and lower(invited_email) = lower(new.email);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ----------------------------------------------------------------------------
-- Projects
-- ----------------------------------------------------------------------------
create table if not exists projects (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  code              text,
  summary           text,
  problem_statement text,
  objectives        text,
  assumptions       text,
  dependencies      text,
  start_date        date,
  end_date          date,
  status            text not null default 'active'
                    check (status in ('active','on_hold','complete','archived')),
  created_by        uuid references profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);

-- One row per person per project. user_id stays null until an invited person
-- signs in, so the RACI matrix can name people who have no account yet.
create table if not exists project_members (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  user_id       uuid references profiles(id) on delete cascade,
  invited_email text,
  display_name  text not null,
  role          text,
  is_admin      boolean not null default false,
  created_at    timestamptz not null default now()
);

create unique index if not exists project_members_user_uniq
  on project_members (project_id, user_id) where user_id is not null;
create index if not exists project_members_project_idx on project_members (project_id);
create index if not exists project_members_user_idx    on project_members (user_id);

-- ----------------------------------------------------------------------------
-- Tasks: the Gantt chart and the checklist are the same table.
-- is_summary marks a WBS parent row ("1.0 Summary Task"), which has no dates
-- of its own and rolls up its children.
-- ----------------------------------------------------------------------------
create table if not exists tasks (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  parent_id     uuid references tasks(id) on delete cascade,
  wbs           text,
  title         text not null,
  description   text,
  is_summary    boolean not null default false,
  start_date    date,
  end_date      date,
  pct_complete  int not null default 0 check (pct_complete between 0 and 100),
  status        text not null default 'not_started'
                check (status in ('not_started','in_progress','blocked','done')),
  owner_id      uuid references project_members(id) on delete set null,
  sort_order    double precision not null default 1000,
  completed_at  timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists tasks_project_idx on tasks (project_id);
create index if not exists tasks_due_idx     on tasks (end_date) where status <> 'done';

-- ----------------------------------------------------------------------------
-- RACI: one letter per person per task.
-- ----------------------------------------------------------------------------
create table if not exists raci_assignments (
  id        uuid primary key default gen_random_uuid(),
  task_id   uuid not null references tasks(id) on delete cascade,
  member_id uuid not null references project_members(id) on delete cascade,
  letter    text not null check (letter in ('R','A','C','I')),
  unique (task_id, member_id)
);

create index if not exists raci_task_idx on raci_assignments (task_id);

-- ----------------------------------------------------------------------------
-- Milestones
-- ----------------------------------------------------------------------------
create table if not exists milestones (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  number          text,
  title           text not null,
  due_date        date,
  completion_date date,
  owner_id        uuid references project_members(id) on delete set null,
  sort_order      double precision not null default 1000,
  created_at      timestamptz not null default now()
);

create index if not exists milestones_project_idx on milestones (project_id);
create index if not exists milestones_due_idx on milestones (due_date) where completion_date is null;

-- ----------------------------------------------------------------------------
-- Risk register. likelihood and consequence are the 1 to 5 scores from the
-- template; score is their product, which drives the heat colour.
-- ----------------------------------------------------------------------------
create table if not exists risks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  risk_no     text,
  description text not null,
  impact      text,
  consequence text,
  likelihood  int check (likelihood between 1 and 5),
  severity    int check (severity between 1 and 5),
  mitigation  text,
  owner_id    uuid references project_members(id) on delete set null,
  comments    text,
  status      text not null default 'open' check (status in ('open','mitigated','closed')),
  sort_order  double precision not null default 1000,
  created_at  timestamptz not null default now()
);

create index if not exists risks_project_idx on risks (project_id);

-- ----------------------------------------------------------------------------
-- Progress reports. Free text, optionally attached to one task or milestone.
-- kind separates what a person wrote from what the app recorded.
-- ----------------------------------------------------------------------------
create table if not exists updates (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  task_id      uuid references tasks(id) on delete cascade,
  milestone_id uuid references milestones(id) on delete cascade,
  author_id    uuid references profiles(id) on delete set null,
  author_name  text,
  body         text,
  kind         text not null default 'note'
               check (kind in ('note','status_change','completed','reopened')),
  created_at   timestamptz not null default now()
);

create index if not exists updates_project_idx on updates (project_id, created_at desc);
create index if not exists updates_task_idx    on updates (task_id);

-- ----------------------------------------------------------------------------
-- Links to data, notebooks, drive folders, papers. Can hang off a project, a
-- task, or a single progress report.
-- ----------------------------------------------------------------------------
create table if not exists links (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  task_id    uuid references tasks(id) on delete cascade,
  update_id  uuid references updates(id) on delete cascade,
  label      text,
  url        text not null,
  added_by   uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists links_project_idx on links (project_id);
create index if not exists links_task_idx    on links (task_id);

-- ----------------------------------------------------------------------------
-- One row per reminder actually sent, so the daily job never repeats itself.
-- ----------------------------------------------------------------------------
create table if not exists reminder_log (
  id        uuid primary key default gen_random_uuid(),
  entity    text not null,
  entity_id uuid not null,
  recipient text not null,
  stage     text not null,
  sent_at   timestamptz not null default now(),
  unique (entity, entity_id, recipient, stage)
);

-- ============================================================================
-- Row level security
--
-- Membership is checked through a security definer function. Asking the
-- project_members table directly inside its own policy would recurse.
-- ============================================================================

create or replace function is_project_member(p uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from project_members m
     where m.project_id = p
       and m.user_id = auth.uid()
  );
$$;

create or replace function is_project_admin(p uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from project_members m
     where m.project_id = p
       and m.user_id = auth.uid()
       and m.is_admin
  );
$$;

alter table profiles         enable row level security;
alter table projects         enable row level security;
alter table project_members  enable row level security;
alter table tasks            enable row level security;
alter table raci_assignments enable row level security;
alter table milestones       enable row level security;
alter table risks            enable row level security;
alter table updates          enable row level security;
alter table links            enable row level security;
alter table reminder_log     enable row level security;

-- Profiles: everyone signed in can read the directory, nobody can edit anyone
-- else. Reading it is what makes names appear next to tasks.
drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles
  for select to authenticated using (true);

drop policy if exists profiles_write_self on profiles;
create policy profiles_write_self on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Projects
drop policy if exists projects_read on projects;
create policy projects_read on projects
  for select to authenticated using (is_project_member(id));

drop policy if exists projects_insert on projects;
create policy projects_insert on projects
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists projects_update on projects;
create policy projects_update on projects
  for update to authenticated using (is_project_member(id)) with check (is_project_member(id));

drop policy if exists projects_delete on projects;
create policy projects_delete on projects
  for delete to authenticated using (is_project_admin(id));

-- Members. The insert policy allows the creator of a brand new project to add
-- the first seat, which is themselves, before any membership exists.
drop policy if exists members_read on project_members;
create policy members_read on project_members
  for select to authenticated
  using (user_id = auth.uid() or is_project_member(project_id));

-- Deliberately NOT "user_id = auth.uid()". That would let any signed in person
-- add themselves to any project and read it. The very first seat, the
-- creator's own, is written by create_project below rather than from here.
drop policy if exists members_insert on project_members;
create policy members_insert on project_members
  for insert to authenticated
  with check (is_project_admin(project_id));

-- Admins manage the roster. Anyone may correct their own name and role.
drop policy if exists members_update on project_members;
create policy members_update on project_members
  for update to authenticated
  using (is_project_admin(project_id) or user_id = auth.uid())
  with check (is_project_admin(project_id) or user_id = auth.uid());

drop policy if exists members_delete on project_members;
create policy members_delete on project_members
  for delete to authenticated using (is_project_admin(project_id));

-- Everything that hangs off a project follows the same rule: members may read
-- and write, non members see nothing.
do $$
declare t text;
begin
  foreach t in array array['tasks','milestones','risks','updates','links']
  loop
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format(
      'create policy %I on %I for select to authenticated using (is_project_member(project_id))',
      t || '_read', t);

    execute format('drop policy if exists %I on %I', t || '_insert', t);
    execute format(
      'create policy %I on %I for insert to authenticated with check (is_project_member(project_id))',
      t || '_insert', t);

    execute format('drop policy if exists %I on %I', t || '_update', t);
    execute format(
      'create policy %I on %I for update to authenticated using (is_project_member(project_id)) with check (is_project_member(project_id))',
      t || '_update', t);

    execute format('drop policy if exists %I on %I', t || '_delete', t);
    execute format(
      'create policy %I on %I for delete to authenticated using (is_project_member(project_id))',
      t || '_delete', t);
  end loop;
end $$;

-- RACI rows are reached through their task.
drop policy if exists raci_all on raci_assignments;
create policy raci_all on raci_assignments
  for all to authenticated
  using (exists (select 1 from tasks t where t.id = task_id and is_project_member(t.project_id)))
  with check (exists (select 1 from tasks t where t.id = task_id and is_project_member(t.project_id)));

-- The reminder log is written only by the scheduled function, which uses the
-- service role key and bypasses these policies. No client may read it.
drop policy if exists reminder_log_none on reminder_log;
create policy reminder_log_none on reminder_log
  for select to authenticated using (false);

-- ============================================================================
-- Creating a project.
--
-- Two rows have to appear together: the project, and the creator's own
-- membership. Written from a browser as two requests, the creator is briefly
-- not a member of their own project, and projects_read then refuses to return
-- the row that was just inserted. One definer function avoids that gap.
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

-- ============================================================================
-- Helper used by the landing page: every row a signed in person is allowed to
-- see, already joined, so the client makes one request instead of six.
-- ============================================================================
create or replace view my_projects
with (security_invoker = on)
as
select
  p.*,
  (select count(*) from tasks t
    where t.project_id = p.id and not t.is_summary)                         as task_count,
  (select count(*) from tasks t
    where t.project_id = p.id and not t.is_summary and t.status = 'done')   as task_done,
  (select count(*) from tasks t
    where t.project_id = p.id and not t.is_summary and t.status <> 'done'
      and t.end_date < current_date)                                        as task_overdue,
  (select min(t.end_date) from tasks t
    where t.project_id = p.id and not t.is_summary and t.status <> 'done'
      and t.end_date >= current_date)                                       as next_due,
  (select count(*) from milestones m
    where m.project_id = p.id and m.completion_date is null)                as milestones_open,
  (select count(*) from risks r
    where r.project_id = p.id and r.status = 'open'
      and coalesce(r.likelihood,0) * coalesce(r.severity,0) >= 15)          as risks_high,
  (select max(u.created_at) from updates u where u.project_id = p.id)       as last_activity
from projects p;

grant select on my_projects to authenticated;

drop function if exists is_project_creator(uuid);
