export type ProjectStatus = "active" | "on_hold" | "complete" | "archived";
export type TaskStatus = "not_started" | "in_progress" | "blocked" | "done";
export type RaciLetter = "R" | "A" | "C" | "I";
export type RiskStatus = "open" | "mitigated" | "closed";
export type UpdateKind = "note" | "status_change" | "completed" | "reopened";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  title: string | null;
}

export interface Project {
  id: string;
  name: string;
  code: string | null;
  summary: string | null;
  problem_statement: string | null;
  objectives: string | null;
  assumptions: string | null;
  dependencies: string | null;
  start_date: string | null;
  end_date: string | null;
  status: ProjectStatus;
  created_by: string | null;
  created_at: string;
}

/** The projects view, which adds the roll-ups the landing page needs. */
export interface ProjectRollup extends Project {
  task_count: number;
  task_done: number;
  task_overdue: number;
  next_due: string | null;
  milestones_open: number;
  risks_high: number;
  last_activity: string | null;
}

export interface Member {
  id: string;
  project_id: string;
  user_id: string | null;
  invited_email: string | null;
  display_name: string;
  role: string | null;
  is_admin: boolean;
}

export interface Task {
  id: string;
  project_id: string;
  parent_id: string | null;
  wbs: string | null;
  title: string;
  description: string | null;
  is_summary: boolean;
  start_date: string | null;
  end_date: string | null;
  pct_complete: number;
  status: TaskStatus;
  owner_id: string | null;
  sort_order: number;
  completed_at: string | null;
}

export interface RaciAssignment {
  id: string;
  task_id: string;
  member_id: string;
  letter: RaciLetter;
}

export interface Milestone {
  id: string;
  project_id: string;
  number: string | null;
  title: string;
  due_date: string | null;
  completion_date: string | null;
  owner_id: string | null;
  sort_order: number;
}

export interface Risk {
  id: string;
  project_id: string;
  risk_no: string | null;
  description: string;
  impact: string | null;
  consequence: string | null;
  likelihood: number | null;
  severity: number | null;
  mitigation: string | null;
  owner_id: string | null;
  comments: string | null;
  status: RiskStatus;
  sort_order: number;
}

export interface Update {
  id: string;
  project_id: string;
  task_id: string | null;
  milestone_id: string | null;
  author_id: string | null;
  author_name: string | null;
  body: string | null;
  kind: UpdateKind;
  created_at: string;
}

export interface LinkRow {
  id: string;
  project_id: string;
  task_id: string | null;
  update_id: string | null;
  label: string | null;
  url: string;
  added_by: string | null;
  created_at: string;
}

/** Everything one project screen needs, loaded together. */
export interface ProjectBundle {
  project: Project;
  members: Member[];
  tasks: Task[];
  raci: RaciAssignment[];
  milestones: Milestone[];
  risks: Risk[];
  updates: Update[];
  links: LinkRow[];
}
