import type { RaciAssignment, RaciLetter, Task } from "./types";

export const RACI_LETTERS: RaciLetter[] = ["R", "A", "C", "I"];

export const RACI_MEANING: Record<RaciLetter, string> = {
  R: "Responsible: does the work",
  A: "Accountable: owns the result and signs off",
  C: "Consulted: gives input before the work is done",
  I: "Informed: kept up to date on progress",
};

export const RACI_SHORT: Record<RaciLetter, string> = {
  R: "Responsible",
  A: "Accountable",
  C: "Consulted",
  I: "Informed",
};

export interface RowCheck {
  responsible: number;
  accountable: number;
  ok: boolean;
  /** Empty when the row is fine, otherwise what needs fixing, in plain words. */
  problem: string;
}

/**
 * The same rule the spreadsheet enforces in its Check column: a task needs
 * exactly one person accountable and at least one person responsible.
 */
export function checkRow(assignments: RaciAssignment[]): RowCheck {
  const responsible = assignments.filter((a) => a.letter === "R").length;
  const accountable = assignments.filter((a) => a.letter === "A").length;

  let problem = "";
  if (accountable === 0 && responsible === 0) problem = "Nobody assigned";
  else if (accountable === 0) problem = "No one accountable";
  else if (accountable > 1) problem = `${accountable} people accountable, needs exactly one`;
  else if (responsible === 0) problem = "No one responsible";

  return { responsible, accountable, ok: problem === "", problem };
}

/** Group assignments by task, so each row is checked in one pass. */
export function byTask(raci: RaciAssignment[]): Map<string, RaciAssignment[]> {
  const map = new Map<string, RaciAssignment[]>();
  for (const a of raci) {
    const list = map.get(a.task_id);
    if (list) list.push(a);
    else map.set(a.task_id, [a]);
  }
  return map;
}

/** How many rows of the matrix currently fail the check. */
export function countProblems(tasks: Task[], raci: RaciAssignment[]): number {
  const grouped = byTask(raci);
  return tasks.filter((t) => !t.is_summary && !checkRow(grouped.get(t.id) ?? []).ok).length;
}

/**
 * Every person's workload across the matrix, which is the question a lab lead
 * actually asks: who is carrying too much.
 */
export function loadByMember(raci: RaciAssignment[]): Map<string, Record<RaciLetter, number>> {
  const map = new Map<string, Record<RaciLetter, number>>();
  for (const a of raci) {
    let row = map.get(a.member_id);
    if (!row) {
      row = { R: 0, A: 0, C: 0, I: 0 };
      map.set(a.member_id, row);
    }
    row[a.letter] += 1;
  }
  return map;
}
