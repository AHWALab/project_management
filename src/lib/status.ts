import { differenceInCalendarDays, parseISO, isValid, format } from "date-fns";
import type { Task, Milestone, Risk, ProjectRollup } from "./types";

/**
 * The four readings every dated thing in this app resolves to. The names come
 * from gauge thresholds on purpose: the same word means the same colour in the
 * timeline, the tiles, the milestone list and the reminder emails.
 */
export type Stage = "done" | "ontrack" | "duesoon" | "overdue" | "idle";

export const DUE_SOON_DAYS = 7;

export interface StageInfo {
  stage: Stage;
  /** Days until the due date. Negative when it has passed. Null when undated. */
  days: number | null;
  label: string;
}

export function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = parseISO(value);
  return isValid(d) ? d : null;
}

function daysUntil(value: string | null, today: Date): number | null {
  const d = toDate(value);
  return d ? differenceInCalendarDays(d, today) : null;
}

export function taskStage(
  task: Pick<Task, "status" | "end_date">,
  today = new Date()
): StageInfo {
  if (task.status === "done") {
    return { stage: "done", days: null, label: "Done" };
  }
  const days = daysUntil(task.end_date, today);
  if (days === null) {
    return { stage: "idle", days: null, label: "No date" };
  }
  if (days < 0) {
    const n = Math.abs(days);
    return { stage: "overdue", days, label: n === 1 ? "1 day late" : `${n} days late` };
  }
  if (days === 0) return { stage: "duesoon", days, label: "Due today" };
  if (days <= DUE_SOON_DAYS) {
    return { stage: "duesoon", days, label: days === 1 ? "Due tomorrow" : `Due in ${days} days` };
  }
  return { stage: "ontrack", days, label: `Due in ${days} days` };
}

export function milestoneStage(
  m: Pick<Milestone, "completion_date" | "due_date">,
  today = new Date()
): StageInfo {
  if (m.completion_date) {
    return { stage: "done", days: null, label: "Reached" };
  }
  const days = daysUntil(m.due_date, today);
  if (days === null) return { stage: "idle", days: null, label: "No date" };
  if (days < 0) {
    const n = Math.abs(days);
    return { stage: "overdue", days, label: n === 1 ? "1 day late" : `${n} days late` };
  }
  if (days === 0) return { stage: "duesoon", days, label: "Due today" };
  if (days <= DUE_SOON_DAYS) {
    return { stage: "duesoon", days, label: days === 1 ? "Due tomorrow" : `Due in ${days} days` };
  }
  return { stage: "ontrack", days, label: `Due in ${days} days` };
}

/** The worst reading across a project, which is what its tile edge shows. */
export function projectStage(p: ProjectRollup, today = new Date()): StageInfo {
  if (p.status === "complete") return { stage: "done", days: null, label: "Complete" };
  if (p.task_overdue > 0) {
    return {
      stage: "overdue",
      days: null,
      label: p.task_overdue === 1 ? "1 task late" : `${p.task_overdue} tasks late`,
    };
  }
  const days = daysUntil(p.next_due, today);
  if (days === null) {
    if (p.task_count === 0) return { stage: "idle", days: null, label: "No tasks yet" };
    if (p.task_done === p.task_count) return { stage: "done", days: null, label: "All tasks done" };
    return { stage: "idle", days: null, label: "No dates set" };
  }
  if (days === 0) return { stage: "duesoon", days, label: "Due today" };
  if (days <= DUE_SOON_DAYS) {
    return { stage: "duesoon", days, label: days === 1 ? "Due tomorrow" : `Due in ${days} days` };
  }
  return { stage: "ontrack", days, label: `Next due in ${days} days` };
}

/** Tailwind class names per stage, so the mapping lives in exactly one place. */
export const stageStyle: Record<Stage, { text: string; bg: string; dot: string; border: string }> = {
  overdue: { text: "text-flood", bg: "bg-flood-soft", dot: "bg-flood", border: "border-flood" },
  duesoon: { text: "text-stage", bg: "bg-stage-soft", dot: "bg-stage", border: "border-stage" },
  ontrack: { text: "text-reach", bg: "bg-reach-soft", dot: "bg-reach", border: "border-reach" },
  done: { text: "text-done", bg: "bg-done-soft", dot: "bg-done", border: "border-done" },
  idle: { text: "text-ink-3", bg: "bg-slack-soft", dot: "bg-slack", border: "border-line-strong" },
};

/** CSS variable per stage, for SVG fills where a class will not reach. */
export const stageVar: Record<Stage, string> = {
  overdue: "var(--c-flood)",
  duesoon: "var(--c-stage)",
  ontrack: "var(--c-reach)",
  done: "var(--c-done)",
  idle: "var(--c-slack)",
};

export const taskStatusLabel: Record<Task["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

/** Likelihood times severity, the score the risk template produces. */
export function riskScore(r: Risk): number | null {
  if (r.likelihood == null || r.severity == null) return null;
  return r.likelihood * r.severity;
}

export function riskBand(score: number | null): { label: string; stage: Stage } {
  if (score == null) return { label: "Unscored", stage: "idle" };
  if (score >= 15) return { label: "High", stage: "overdue" };
  if (score >= 8) return { label: "Medium", stage: "duesoon" };
  return { label: "Low", stage: "ontrack" };
}

/* ------------------------------------------------------------------------- */
/* Date formatting. Dates are stored as plain yyyy-MM-dd and must never be  */
/* shifted by a timezone, so they are formatted from the parsed local date.  */
/* ------------------------------------------------------------------------- */

export function fmtDate(value: string | null): string {
  const d = toDate(value);
  return d ? format(d, "d MMM yyyy") : "";
}

export function fmtShort(value: string | null): string {
  const d = toDate(value);
  return d ? format(d, "d MMM") : "";
}

export function fmtDateTime(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  return isValid(d) ? format(d, "d MMM yyyy, HH:mm") : "";
}

export function relativeTime(value: string | null): string {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs === 1 ? "1 hour ago" : `${hrs} hours ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return days === 1 ? "yesterday" : `${days} days ago`;
  return fmtDate(value.slice(0, 10));
}

/** yyyy-MM-dd for an input[type=date], without timezone drift. */
export function isoDay(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/** Initials for an avatar, from a display name or an email. */
export function initials(name: string | null | undefined, email?: string | null): string {
  const source = (name || email || "?").trim();
  const parts = source.replace(/@.*$/, "").split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
