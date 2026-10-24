import { supabase } from "./supabase";
import type {
  LinkRow,
  Member,
  Milestone,
  Project,
  ProjectBundle,
  ProjectRollup,
  RaciAssignment,
  RaciLetter,
  Risk,
  Task,
  Update,
  UpdateKind,
} from "./types";

/** Throws with the message Supabase gave, so the interface can show it. */
function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/* ------------------------------------------------------------------ reads */

export async function fetchProjects(): Promise<ProjectRollup[]> {
  return check(
    await supabase.from("my_projects").select("*").order("created_at", { ascending: false })
  );
}

export async function fetchMyMemberships(): Promise<Member[]> {
  return check(await supabase.from("project_members").select("*"));
}

/**
 * Every unfinished dated task and milestone the signed in person can see, up
 * to the given horizon. Row level security already limits this to their own
 * projects, so no project filter is needed here.
 */
export async function fetchDueItems(horizonIso: string): Promise<{
  tasks: Pick<Task, "id" | "project_id" | "title" | "end_date" | "status">[];
  milestones: Pick<Milestone, "id" | "project_id" | "title" | "due_date" | "completion_date">[];
}> {
  const [tasks, milestones] = await Promise.all([
    supabase
      .from("tasks")
      .select("id,project_id,title,end_date,status")
      .eq("is_summary", false)
      .neq("status", "done")
      .not("end_date", "is", null)
      .lte("end_date", horizonIso)
      .order("end_date"),
    supabase
      .from("milestones")
      .select("id,project_id,title,due_date,completion_date")
      .is("completion_date", null)
      .not("due_date", "is", null)
      .lte("due_date", horizonIso)
      .order("due_date"),
  ]);
  return { tasks: check(tasks), milestones: check(milestones) };
}

export async function fetchBundle(projectId: string): Promise<ProjectBundle> {
  const [project, members, tasks, milestones, risks, updates, links] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).single(),
    supabase.from("project_members").select("*").eq("project_id", projectId).order("created_at"),
    supabase.from("tasks").select("*").eq("project_id", projectId).order("sort_order"),
    supabase.from("milestones").select("*").eq("project_id", projectId).order("sort_order"),
    supabase.from("risks").select("*").eq("project_id", projectId).order("sort_order"),
    supabase
      .from("updates")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("links").select("*").eq("project_id", projectId).order("created_at"),
  ]);

  const taskRows = check<Task[]>(tasks);
  // RACI hangs off tasks, so it needs their ids first.
  const raci =
    taskRows.length === 0
      ? []
      : check<RaciAssignment[]>(
          await supabase
            .from("raci_assignments")
            .select("*")
            .in(
              "task_id",
              taskRows.map((t) => t.id)
            )
        );

  return {
    project: check<Project>(project),
    members: check<Member[]>(members),
    tasks: taskRows,
    raci,
    milestones: check<Milestone[]>(milestones),
    risks: check<Risk[]>(risks),
    updates: check<Update[]>(updates),
    links: check<LinkRow[]>(links),
  };
}

/* --------------------------------------------------------------- projects */

export async function createProject(input: {
  name: string;
  code?: string | null;
  summary?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  ownerUserId: string;
  ownerName: string;
}): Promise<Project> {
  const project = check<Project>(
    await supabase
      .from("projects")
      .insert({
        name: input.name,
        code: input.code || null,
        summary: input.summary || null,
        start_date: input.start_date || null,
        end_date: input.end_date || null,
        created_by: input.ownerUserId,
      })
      .select()
      .single()
  );

  // The creator becomes the first member and an admin. Without this row the
  // row level security policies would hide the project from its own author.
  const seat = await supabase.from("project_members").insert({
    project_id: project.id,
    user_id: input.ownerUserId,
    display_name: input.ownerName,
    role: "Project lead",
    is_admin: true,
  });
  if (seat.error) {
    // Leaving a project nobody can see would be worse than failing loudly.
    await supabase.from("projects").delete().eq("id", project.id);
    throw new Error(`Could not add you to the new project: ${seat.error.message}`);
  }

  return project;
}

export async function updateProject(id: string, patch: Partial<Project>): Promise<void> {
  const res = await supabase.from("projects").update(patch).eq("id", id);
  if (res.error) throw new Error(res.error.message);
}

export async function deleteProject(id: string): Promise<void> {
  const res = await supabase.from("projects").delete().eq("id", id);
  if (res.error) throw new Error(res.error.message);
}

/* ---------------------------------------------------------------- members */

export async function addMember(input: {
  project_id: string;
  display_name: string;
  invited_email?: string | null;
  role?: string | null;
  is_admin?: boolean;
}): Promise<Member> {
  return check<Member>(
    await supabase
      .from("project_members")
      .insert({
        project_id: input.project_id,
        display_name: input.display_name,
        invited_email: input.invited_email?.trim().toLowerCase() || null,
        role: input.role || null,
        is_admin: input.is_admin ?? false,
      })
      .select()
      .single()
  );
}

export async function updateMember(id: string, patch: Partial<Member>): Promise<void> {
  const res = await supabase.from("project_members").update(patch).eq("id", id);
  if (res.error) throw new Error(res.error.message);
}

export async function removeMember(id: string): Promise<void> {
  const res = await supabase.from("project_members").delete().eq("id", id);
  if (res.error) throw new Error(res.error.message);
}

/* ------------------------------------------------------------------ tasks */

export async function addTask(input: Partial<Task> & { project_id: string; title: string }): Promise<Task> {
  return check<Task>(await supabase.from("tasks").insert(input).select().single());
}

export async function updateTask(id: string, patch: Partial<Task>): Promise<void> {
  const res = await supabase.from("tasks").update(patch).eq("id", id);
  if (res.error) throw new Error(res.error.message);
}

export async function deleteTask(id: string): Promise<void> {
  const res = await supabase.from("tasks").delete().eq("id", id);
  if (res.error) throw new Error(res.error.message);
}

/**
 * Marking a task done is the single most common action in the app, so it also
 * writes the progress note that explains itself in the activity feed.
 */
export async function setTaskDone(
  task: Task,
  done: boolean,
  author: { id: string; name: string },
  note?: string
): Promise<void> {
  await updateTask(task.id, {
    status: done ? "done" : "in_progress",
    pct_complete: done ? 100 : Math.min(task.pct_complete, 90),
    completed_at: done ? new Date().toISOString() : null,
  });
  await addUpdate({
    project_id: task.project_id,
    task_id: task.id,
    author_id: author.id,
    author_name: author.name,
    body: note?.trim() || null,
    kind: done ? "completed" : "reopened",
  });
}

/* ------------------------------------------------------------------- RACI */

/** Sets, changes or clears one cell of the matrix. */
export async function setRaci(
  task_id: string,
  member_id: string,
  letter: RaciLetter | null
): Promise<void> {
  if (letter === null) {
    const res = await supabase
      .from("raci_assignments")
      .delete()
      .eq("task_id", task_id)
      .eq("member_id", member_id);
    if (res.error) throw new Error(res.error.message);
    return;
  }
  const res = await supabase
    .from("raci_assignments")
    .upsert({ task_id, member_id, letter }, { onConflict: "task_id,member_id" });
  if (res.error) throw new Error(res.error.message);
}

/* ------------------------------------------------------------- milestones */

export async function addMilestone(
  input: Partial<Milestone> & { project_id: string; title: string }
): Promise<Milestone> {
  return check<Milestone>(await supabase.from("milestones").insert(input).select().single());
}

export async function updateMilestone(id: string, patch: Partial<Milestone>): Promise<void> {
  const res = await supabase.from("milestones").update(patch).eq("id", id);
  if (res.error) throw new Error(res.error.message);
}

export async function deleteMilestone(id: string): Promise<void> {
  const res = await supabase.from("milestones").delete().eq("id", id);
  if (res.error) throw new Error(res.error.message);
}

/* ------------------------------------------------------------------ risks */

export async function addRisk(
  input: Partial<Risk> & { project_id: string; description: string }
): Promise<Risk> {
  return check<Risk>(await supabase.from("risks").insert(input).select().single());
}

export async function updateRisk(id: string, patch: Partial<Risk>): Promise<void> {
  const res = await supabase.from("risks").update(patch).eq("id", id);
  if (res.error) throw new Error(res.error.message);
}

export async function deleteRisk(id: string): Promise<void> {
  const res = await supabase.from("risks").delete().eq("id", id);
  if (res.error) throw new Error(res.error.message);
}

/* ---------------------------------------------------------------- updates */

export async function addUpdate(input: {
  project_id: string;
  task_id?: string | null;
  milestone_id?: string | null;
  author_id: string;
  author_name: string;
  body: string | null;
  kind?: UpdateKind;
}): Promise<Update> {
  return check<Update>(
    await supabase
      .from("updates")
      .insert({
        project_id: input.project_id,
        task_id: input.task_id ?? null,
        milestone_id: input.milestone_id ?? null,
        author_id: input.author_id,
        author_name: input.author_name,
        body: input.body,
        kind: input.kind ?? "note",
      })
      .select()
      .single()
  );
}

export async function deleteUpdate(id: string): Promise<void> {
  const res = await supabase.from("updates").delete().eq("id", id);
  if (res.error) throw new Error(res.error.message);
}

/* ------------------------------------------------------------------ links */

export async function addLink(input: {
  project_id: string;
  task_id?: string | null;
  update_id?: string | null;
  url: string;
  label?: string | null;
  added_by: string;
}): Promise<LinkRow> {
  return check<LinkRow>(
    await supabase
      .from("links")
      .insert({
        project_id: input.project_id,
        task_id: input.task_id ?? null,
        update_id: input.update_id ?? null,
        url: normalizeUrl(input.url),
        label: input.label?.trim() || null,
        added_by: input.added_by,
      })
      .select()
      .single()
  );
}

export async function deleteLink(id: string): Promise<void> {
  const res = await supabase.from("links").delete().eq("id", id);
  if (res.error) throw new Error(res.error.message);
}

/** People paste bare hostnames and drive paths; make them clickable. */
export function normalizeUrl(raw: string): string {
  const v = raw.trim();
  if (/^(https?:|mailto:|file:)/i.test(v)) return v;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(v)) return `https://${v}`;
  return v;
}
