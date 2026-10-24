import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, Check } from "lucide-react";
import type { TabProps } from "../pages/Project";
import { Avatar, EmptyState, ErrorNote } from "../components/bits";
import { setRaci } from "../lib/db";
import { useAction } from "../lib/hooks";
import { RACI_LETTERS, RACI_MEANING, RACI_SHORT, byTask, checkRow, loadByMember } from "../lib/raci";
import type { RaciLetter } from "../lib/types";

/** Clicking a cell walks through the letters and then back to empty. */
function nextLetter(current: RaciLetter | null): RaciLetter | null {
  if (current === null) return "R";
  const i = RACI_LETTERS.indexOf(current);
  return i === RACI_LETTERS.length - 1 ? null : RACI_LETTERS[i + 1];
}

const LETTER_STYLE: Record<RaciLetter, { bg: string; fg: string; weight: number }> = {
  R: { bg: "var(--c-reach)", fg: "#fff", weight: 700 },
  A: { bg: "var(--c-flood)", fg: "#fff", weight: 700 },
  C: { bg: "var(--c-stage-soft)", fg: "var(--c-stage)", weight: 650 },
  I: { bg: "transparent", fg: "var(--c-ink-3)", weight: 600 },
};

export default function RaciTab({ bundle, reload }: TabProps) {
  const { tasks, members, raci } = bundle;
  const { run, error } = useAction();
  const [, setParams] = useSearchParams();

  const rows = useMemo(
    () => tasks.filter((t) => !t.is_summary).sort((a, b) => a.sort_order - b.sort_order),
    [tasks]
  );
  const grouped = useMemo(() => byTask(raci), [raci]);
  const load = useMemo(() => loadByMember(raci), [raci]);

  const problems = rows.filter((t) => !checkRow(grouped.get(t.id) ?? []).ok).length;

  if (members.length === 0) {
    return (
      <EmptyState
        title="Add the team first"
        body="The matrix needs people before it can assign anything. Add your lab mates and collaborators, then come back."
        action={
          <button className="btn btn-primary" onClick={() => setParams({ tab: "team" }, { replace: true })}>
            Go to Team
          </button>
        }
      />
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Add tasks first"
        body="The matrix assigns responsibility task by task, so it needs a task list to work from."
        action={
          <button className="btn btn-primary" onClick={() => setParams({ tab: "timeline" }, { replace: true })}>
            Go to Timeline
          </button>
        }
      />
    );
  }

  const cycle = (taskId: string, memberId: string, current: RaciLetter | null) =>
    void run(async () => {
      await setRaci(taskId, memberId, nextLetter(current));
      await reload();
    });

  return (
    <div className="space-y-5">
      {error && <ErrorNote message={error} />}

      <div className="flex items-start justify-between gap-5 flex-wrap">
        <dl className="grid gap-x-5 gap-y-1 m-0" style={{ gridTemplateColumns: "auto 1fr" }}>
          {RACI_LETTERS.map((l) => (
            <div key={l} className="contents">
              <dt
                className="mono grid place-items-center rounded font-bold"
                style={{
                  width: 20,
                  height: 20,
                  fontSize: 11.5,
                  background: LETTER_STYLE[l].bg,
                  color: LETTER_STYLE[l].fg,
                  border: l === "I" ? "1px solid var(--c-line-strong)" : "none",
                }}
              >
                {l}
              </dt>
              <dd className="m-0 text-[13px] text-ink-2">{RACI_MEANING[l]}</dd>
            </div>
          ))}
        </dl>

        <div
          className="rounded-md px-3 py-2 text-[13px] shrink-0"
          style={{
            background: problems ? "var(--c-flood-soft)" : "var(--c-done-soft)",
            color: problems ? "var(--c-flood)" : "var(--c-done)",
          }}
        >
          {problems === 0 ? (
            <span className="flex items-center gap-1.5 font-semibold">
              <Check size={14} /> Every task has one accountable owner
            </span>
          ) : (
            <span className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle size={14} />
              {problems === 1 ? "1 task needs fixing" : `${problems} tasks need fixing`}
            </span>
          )}
        </div>
      </div>

      <div className="border border-line rounded-lg bg-surface overflow-x-auto thin-scroll">
        {/* Deliberately not full width. Stretching the task column pushes the
            cells to the far right, which is the one place they must not be. */}
        <table className="border-collapse" style={{ minWidth: 520 + members.length * 46 }}>
          <caption className="sr-only">
            Who is responsible, accountable, consulted and informed for each task
          </caption>
          <thead>
            <tr className="border-b border-line-strong">
              <th
                scope="col"
                className="text-left align-bottom text-[11px] font-bold text-ink-3 px-3 pb-2 sticky left-0 bg-raised z-10"
                style={{ width: 400, minWidth: 260 }}
              >
                Task
              </th>
              {members.map((m) => (
                <th key={m.id} scope="col" className="px-1 py-2 align-bottom" style={{ width: 46 }}>
                  {/* Names run vertically so twelve people still fit on a laptop. */}
                  <div className="grid place-items-center gap-1.5">
                    <Avatar
                      name={m.display_name}
                      email={m.invited_email}
                      size={24}
                      title={`${m.display_name}${m.role ? `, ${m.role}` : ""}`}
                      dimmed={!m.user_id}
                    />
                    <span
                      className="text-[11px] font-semibold text-ink-2 whitespace-nowrap"
                      style={{ writingMode: "vertical-rl", rotate: "180deg", maxHeight: 124, overflow: "hidden" }}
                      title={m.display_name}
                    >
                      {m.display_name}
                    </span>
                  </div>
                </th>
              ))}
              <th scope="col" className="px-2 pb-2 align-bottom text-[11px] font-bold text-ink-3" style={{ width: 34 }} title="How many people are Responsible">
                R
              </th>
              <th scope="col" className="px-2 pb-2 align-bottom text-[11px] font-bold text-ink-3" style={{ width: 34 }} title="How many people are Accountable">
                A
              </th>
              <th scope="col" className="px-3 pb-2 align-bottom text-left text-[11px] font-bold text-ink-3" style={{ minWidth: 150 }}>
                Check
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const assignments = grouped.get(t.id) ?? [];
              const chk = checkRow(assignments);
              const letterOf = new Map(assignments.map((a) => [a.member_id, a.letter]));
              return (
                <tr key={t.id} className="border-b border-line hover:bg-raised transition">
                  <th
                    scope="row"
                    className="text-left font-normal px-3 py-1.5 sticky left-0 bg-surface z-10"
                    style={{ boxShadow: "1px 0 0 0 var(--c-line)" }}
                  >
                    <span className="flex items-baseline gap-2 min-w-0">
                      <span className="mono text-[11px] text-ink-3 shrink-0">{t.wbs}</span>
                      <span
                        className={`text-[13.5px] truncate ${t.status === "done" ? "text-ink-3" : ""}`}
                        title={t.title}
                      >
                        {t.title}
                      </span>
                    </span>
                  </th>

                  {members.map((m) => {
                    const letter = letterOf.get(m.id) ?? null;
                    const s = letter ? LETTER_STYLE[letter] : null;
                    return (
                      <td key={m.id} className="p-0 text-center border-l border-line">
                        <button
                          onClick={() => cycle(t.id, m.id, letter)}
                          aria-label={
                            letter
                              ? `${m.display_name} is ${RACI_SHORT[letter]} for ${t.title}. Click to change.`
                              : `Assign ${m.display_name} to ${t.title}`
                          }
                          title={letter ? RACI_MEANING[letter] : "Click to assign R, then A, C, I"}
                          className="w-full grid place-items-center transition hover:brightness-95"
                          style={{ height: 34 }}
                        >
                          <span
                            className="mono grid place-items-center rounded"
                            style={{
                              width: 22,
                              height: 22,
                              fontSize: 11.5,
                              fontWeight: s?.weight ?? 500,
                              background: s?.bg ?? "transparent",
                              color: s?.fg ?? "var(--c-line-strong)",
                              border:
                                letter === "I"
                                  ? "1px solid var(--c-line-strong)"
                                  : letter
                                    ? "none"
                                    : "1px dashed var(--c-line)",
                            }}
                          >
                            {letter ?? ""}
                          </span>
                        </button>
                      </td>
                    );
                  })}

                  <td className="mono text-center text-[12px] text-ink-2 border-l border-line">
                    {chk.responsible || ""}
                  </td>
                  <td className="mono text-center text-[12px] text-ink-2">{chk.accountable || ""}</td>
                  <td className="px-3 py-1.5">
                    {chk.ok ? (
                      <span className="text-[12.5px] text-done font-semibold flex items-center gap-1">
                        <Check size={12} /> OK
                      </span>
                    ) : (
                      <span className="text-[12.5px] text-flood font-medium">{chk.problem}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[12.5px] text-ink-3">
        Click a cell to cycle through Responsible, Accountable, Consulted, Informed, and back to
        empty. A task needs exactly one person accountable and at least one responsible, which is the
        rule the Check column applies.
      </p>

      <section className="border border-line rounded-lg bg-surface">
        <div className="px-4 py-3 border-b border-line">
          <h2>Who is carrying what</h2>
          <p className="text-[13px] text-ink-3 mt-0.5">
            Counted across every task, so an overloaded person is visible before they say so.
          </p>
        </div>
        <ul className="list-none m-0 p-0 divide-y divide-line">
          {members.map((m) => {
            const row = load.get(m.id) ?? { R: 0, A: 0, C: 0, I: 0 };
            const total = row.R + row.A;
            return (
              <li key={m.id} className="flex items-center gap-3 px-4 py-2">
                <Avatar name={m.display_name} email={m.invited_email} size={24} dimmed={!m.user_id} />
                <span className="flex-1 min-w-0">
                  <span className="block text-[13.5px] font-medium truncate">{m.display_name}</span>
                  {m.role && <span className="block text-[12px] text-ink-3 truncate">{m.role}</span>}
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {RACI_LETTERS.map((l) => (
                    <span
                      key={l}
                      title={`${row[l]} ${RACI_SHORT[l]}`}
                      className="mono grid place-items-center rounded"
                      style={{
                        width: 30,
                        height: 22,
                        fontSize: 11.5,
                        fontWeight: 600,
                        background: row[l] ? LETTER_STYLE[l].bg : "transparent",
                        color: row[l] ? LETTER_STYLE[l].fg : "var(--c-line-strong)",
                        border:
                          l === "I" || !row[l] ? "1px solid var(--c-line)" : "none",
                      }}
                    >
                      {l}
                      {row[l] ? ` ${row[l]}` : ""}
                    </span>
                  ))}
                </span>
                <span
                  className="mono text-[12px] shrink-0 text-right"
                  style={{ width: 62, color: total > 0 ? "var(--c-ink-2)" : "var(--c-ink-3)" }}
                  title="Tasks where this person does the work or owns the result"
                >
                  {total} active
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
