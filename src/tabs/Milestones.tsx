import { useMemo, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import type { TabProps } from "../pages/Project";
import {
  Avatar,
  DateCell,
  EditableText,
  EmptyState,
  ErrorNote,
  StagePill,
  Toast,
} from "../components/bits";
import { addMilestone, addUpdate, deleteMilestone, updateMilestone } from "../lib/db";
import { useAction } from "../lib/hooks";
import { fmtDate, isoDay, milestoneStage } from "../lib/status";

export default function Milestones({ bundle, reload, me }: TabProps) {
  const { project, milestones, members } = bundle;
  const { run, error } = useAction();
  const [toast, setToast] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const ordered = useMemo(
    () => [...milestones].sort((a, b) => a.sort_order - b.sort_order),
    [milestones]
  );

  const reached = ordered.filter((m) => m.completion_date).length;

  const act = (fn: () => Promise<unknown>, msg?: string) =>
    void run(async () => {
      await fn();
      await reload();
      if (msg) setToast(msg);
    });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    await run(async () => {
      await addMilestone({
        project_id: project.id,
        title,
        number: `${ordered.length + 1}.0`,
        sort_order: Math.max(0, ...ordered.map((m) => m.sort_order)) + 1000,
      });
      await reload();
      setNewTitle("");
    });
  }

  return (
    <div className="space-y-4">
      {error && <ErrorNote message={error} />}

      {ordered.length > 0 && (
        <div className="flex items-baseline justify-between gap-4">
          <h2>
            {reached} of {ordered.length} reached
          </h2>
          <p className="text-[13px] text-ink-3">
            Milestones are the dates you report against. They send reminders like tasks do.
          </p>
        </div>
      )}

      {ordered.length === 0 ? (
        <EmptyState
          title="No milestones yet"
          body="A milestone is a date you will be asked about: a deliverable, a review, a submission. Add the ones this project is judged on."
          action={
            <form onSubmit={create} className="flex gap-2 w-full" style={{ maxWidth: 420 }}>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Draft report to the sponsor"
                aria-label="Milestone title"
                className="field"
              />
              <button className="btn btn-primary shrink-0" disabled={!newTitle.trim()}>
                Add
              </button>
            </form>
          }
        />
      ) : (
        <>
          <ul className="list-none m-0 p-0 space-y-2">
            {ordered.map((m) => {
              const stage = milestoneStage(m);
              const owner = m.owner_id ? memberById.get(m.owner_id) : undefined;
              const done = Boolean(m.completion_date);
              return (
                <li
                  key={m.id}
                  className="border border-line rounded-lg bg-surface overflow-hidden group"
                >
                  <div className="flex">
                    <span
                      aria-hidden="true"
                      className="shrink-0"
                      style={{
                        width: 4,
                        background:
                          stage.stage === "overdue"
                            ? "var(--c-flood)"
                            : stage.stage === "duesoon"
                              ? "var(--c-stage)"
                              : stage.stage === "done"
                                ? "var(--c-done)"
                                : stage.stage === "idle"
                                  ? "var(--c-slack)"
                                  : "var(--c-reach)",
                      }}
                    />
                    <div className="flex-1 min-w-0 p-3">
                      <div className="flex items-start gap-3">
                        <button
                          onClick={() =>
                            act(async () => {
                              const now = done ? null : isoDay(new Date());
                              await updateMilestone(m.id, { completion_date: now });
                              await addUpdate({
                                project_id: project.id,
                                milestone_id: m.id,
                                author_id: me.id,
                                author_name: me.name,
                                body: done ? `Reopened milestone: ${m.title}` : `Reached milestone: ${m.title}`,
                                kind: done ? "reopened" : "completed",
                              });
                            }, done ? "Milestone reopened" : "Milestone marked reached")
                          }
                          aria-pressed={done}
                          aria-label={done ? `Reopen ${m.title}` : `Mark ${m.title} reached`}
                          title={done ? "Reached. Click to reopen." : "Mark as reached"}
                          className="shrink-0 grid place-items-center rounded mt-0.5 transition"
                          style={{
                            width: 22,
                            height: 22,
                            border: `1.5px solid ${done ? "var(--c-done)" : "var(--c-line-strong)"}`,
                            background: done ? "var(--c-done)" : "transparent",
                          }}
                        >
                          {done && <Check size={14} color="#fff" strokeWidth={3} />}
                        </button>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="mono text-[11.5px] text-ink-3">{m.number}</span>
                            <StagePill stage={stage.stage}>{stage.label}</StagePill>
                          </div>
                          <EditableText
                            value={m.title}
                            ariaLabel="Milestone title"
                            onSave={(v) => v && act(() => updateMilestone(m.id, { title: v }))}
                            className={`!text-[14.5px] font-semibold ${done ? "text-ink-3" : ""}`}
                          />
                        </div>

                        <button
                          className="btn btn-danger !px-1.5 !py-1 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                          aria-label={`Delete ${m.title}`}
                          onClick={() => act(() => deleteMilestone(m.id), "Milestone deleted")}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      <div
                        className="grid gap-3 mt-2.5 pl-8"
                        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(146px, 1fr))" }}
                      >
                        <label className="block">
                          <span className="block text-[12px] text-ink-3 mb-0.5">Due</span>
                          <DateCell
                            value={m.due_date}
                            ariaLabel={`Due date for ${m.title}`}
                            onSave={(v) => act(() => updateMilestone(m.id, { due_date: v }))}
                          />
                        </label>
                        <label className="block">
                          <span className="block text-[12px] text-ink-3 mb-0.5">Reached</span>
                          {done ? (
                            <DateCell
                              value={m.completion_date}
                              ariaLabel={`Completion date for ${m.title}`}
                              onSave={(v) => act(() => updateMilestone(m.id, { completion_date: v }))}
                            />
                          ) : (
                            <span className="mono text-[13px] text-ink-3 pl-0.5">not yet</span>
                          )}
                        </label>
                        <label className="block">
                          <span className="block text-[12px] text-ink-3 mb-0.5">Owner</span>
                          <span className="flex items-center gap-1.5">
                            {owner && (
                              <Avatar
                                name={owner.display_name}
                                email={owner.invited_email}
                                size={19}
                                dimmed={!owner.user_id}
                              />
                            )}
                            <select
                              aria-label={`Owner of ${m.title}`}
                              value={m.owner_id ?? ""}
                              onChange={(e) =>
                                act(() => updateMilestone(m.id, { owner_id: e.target.value || null }))
                              }
                              className="qf !text-[13px]"
                            >
                              <option value="">Nobody yet</option>
                              {members.map((mm) => (
                                <option key={mm.id} value={mm.id}>
                                  {mm.display_name}
                                </option>
                              ))}
                            </select>
                          </span>
                        </label>
                        {done && m.due_date && m.completion_date && (
                          <div>
                            <span className="block text-[12px] text-ink-3 mb-0.5">Against plan</span>
                            <span className="mono text-[13px] pl-0.5">
                              {(() => {
                                const slip =
                                  (new Date(m.completion_date).getTime() -
                                    new Date(m.due_date).getTime()) /
                                  86400000;
                                if (slip === 0) return "on the day";
                                if (slip < 0) return `${Math.abs(slip)} days early`;
                                return `${slip} days late`;
                              })()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <form onSubmit={create} className="flex gap-2 pt-1" style={{ maxWidth: 480 }}>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Add another milestone"
              aria-label="New milestone title"
              className="field"
            />
            <button className="btn shrink-0" disabled={!newTitle.trim()}>
              <Plus size={15} />
              Add
            </button>
          </form>
        </>
      )}

      {ordered.some((m) => m.completion_date) && (
        <p className="text-[12.5px] text-ink-3">
          Earliest reached {fmtDate(ordered.filter((m) => m.completion_date).map((m) => m.completion_date!).sort()[0])}.
        </p>
      )}

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
