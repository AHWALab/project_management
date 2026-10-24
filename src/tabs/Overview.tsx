import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import type { TabProps } from "../pages/Project";
import { AvatarRow, DateCell, EditableText, ErrorNote, MiniBar, Toast } from "../components/bits";
import { addLink, deleteLink, normalizeUrl, updateProject } from "../lib/db";
import { useAction } from "../lib/hooks";
import { countProblems } from "../lib/raci";
import { milestoneStage, riskScore, taskStage } from "../lib/status";

/** The fields the Project Summary sheet asks for, in the same order. */
const PROSE_FIELDS = [
  {
    key: "problem_statement",
    label: "Problem statement",
    hint: "What is wrong today, and for whom.",
  },
  {
    key: "objectives",
    label: "Objectives",
    hint: "What this project will deliver.",
  },
  {
    key: "assumptions",
    label: "Assumptions",
    hint: "What has to hold true for the plan to work.",
  },
  {
    key: "dependencies",
    label: "Dependencies",
    hint: "What this project is waiting on from elsewhere.",
  },
] as const;

export default function Overview({ bundle, reload, me }: TabProps) {
  const { project, tasks, milestones, risks, members, raci, links, updates } = bundle;
  const { run, error } = useAction();
  const [toast, setToast] = useState<string | null>(null);
  const [, setParams] = useSearchParams();

  const projectLinks = useMemo(() => links.filter((l) => !l.task_id && !l.update_id), [links]);

  const realTasks = useMemo(() => tasks.filter((t) => !t.is_summary), [tasks]);
  const pct = realTasks.length
    ? Math.round((realTasks.filter((t) => t.status === "done").length / realTasks.length) * 100)
    : 0;

  const attention = useMemo(() => {
    const out: { label: string; detail: string; tab: string }[] = [];

    const lateTasks = realTasks.filter((t) => taskStage(t).stage === "overdue");
    if (lateTasks.length) {
      out.push({
        label: lateTasks.length === 1 ? "1 task past its date" : `${lateTasks.length} tasks past their date`,
        detail: lateTasks
          .slice(0, 3)
          .map((t) => t.title)
          .join(", "),
        tab: "timeline",
      });
    }

    const lateMs = milestones.filter((m) => milestoneStage(m).stage === "overdue");
    if (lateMs.length) {
      out.push({
        label: lateMs.length === 1 ? "1 milestone missed" : `${lateMs.length} milestones missed`,
        detail: lateMs
          .slice(0, 3)
          .map((m) => m.title)
          .join(", "),
        tab: "milestones",
      });
    }

    const raciProblems = countProblems(tasks, raci);
    if (raciProblems) {
      out.push({
        label:
          raciProblems === 1
            ? "1 task has no clear owner"
            : `${raciProblems} tasks have no clear owner`,
        detail: "Every task needs exactly one person accountable and at least one responsible.",
        tab: "raci",
      });
    }

    const highRisks = risks.filter((r) => r.status === "open" && (riskScore(r) ?? 0) >= 15);
    if (highRisks.length) {
      out.push({
        label: highRisks.length === 1 ? "1 high risk open" : `${highRisks.length} high risks open`,
        detail: highRisks
          .slice(0, 2)
          .map((r) => r.description)
          .join(", "),
        tab: "risks",
      });
    }

    const undated = realTasks.filter((t) => !t.end_date && t.status !== "done");
    if (undated.length) {
      out.push({
        label: undated.length === 1 ? "1 task has no date" : `${undated.length} tasks have no date`,
        detail: "Undated tasks never appear in reminders or on the timeline.",
        tab: "timeline",
      });
    }

    return out;
  }, [realTasks, milestones, tasks, raci, risks]);

  const save = (patch: Record<string, unknown>) =>
    void run(async () => {
      await updateProject(project.id, patch);
      await reload();
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start">
      {/* ------------------------------------------------------ left column */}
      <div className="space-y-6 min-w-0">
        {error && <ErrorNote message={error} />}

        <section className="border border-line rounded-lg bg-surface">
          <div className="px-4 py-3 border-b border-line">
            <h2>Project summary</h2>
          </div>
          <dl className="m-0 divide-y divide-line">
            <Row label="Name">
              <EditableText
                value={project.name}
                ariaLabel="Project name"
                onSave={(v) => v && save({ name: v })}
                className="font-semibold"
              />
            </Row>
            <Row label="Short code">
              <EditableText
                value={project.code}
                ariaLabel="Short code"
                placeholder="FY26-087"
                mono
                onSave={(v) => save({ code: v })}
              />
            </Row>
            <Row label="One line summary">
              <EditableText
                value={project.summary}
                ariaLabel="Summary"
                placeholder="What this project does, in a sentence"
                onSave={(v) => save({ summary: v })}
              />
            </Row>
            <Row label="Team">
              <div className="flex items-center gap-2 py-0.5">
                {members.length > 0 ? (
                  <>
                    <AvatarRow people={members} size={24} max={6} />
                    <button
                      className="text-[13px] text-ink-2 hover:underline"
                      onClick={() => setParams({ tab: "team" }, { replace: true })}
                    >
                      {members.length} {members.length === 1 ? "person" : "people"}
                    </button>
                  </>
                ) : (
                  <button
                    className="text-[13px] text-reach hover:underline"
                    onClick={() => setParams({ tab: "team" }, { replace: true })}
                  >
                    Add the team
                  </button>
                )}
              </div>
            </Row>
            <Row label="Start">
              <DateCell
                value={project.start_date}
                ariaLabel="Start date"
                onSave={(v) => save({ start_date: v })}
              />
            </Row>
            <Row label="Target finish">
              <DateCell
                value={project.end_date}
                ariaLabel="Target finish date"
                onSave={(v) => save({ end_date: v })}
              />
            </Row>
            <Row label="Status">
              <select
                aria-label="Project status"
                value={project.status}
                onChange={(e) => save({ status: e.target.value })}
                className="qf"
              >
                <option value="active">Active</option>
                <option value="on_hold">On hold</option>
                <option value="complete">Complete</option>
                <option value="archived">Archived</option>
              </select>
            </Row>
          </dl>
        </section>

        {PROSE_FIELDS.map((f) => (
          <section key={f.key} className="border border-line rounded-lg bg-surface">
            <div className="px-4 py-3 border-b border-line">
              <h2>{f.label}</h2>
              <p className="text-[13px] text-ink-3 mt-0.5">{f.hint}</p>
            </div>
            <div className="px-4 py-3">
              <EditableText
                value={project[f.key]}
                ariaLabel={f.label}
                multiline
                placeholder="Nothing written yet"
                onSave={(v) => save({ [f.key]: v })}
                className="text-[14.5px] leading-relaxed"
              />
            </div>
          </section>
        ))}
      </div>

      {/* ----------------------------------------------------- right column */}
      <div className="space-y-5 min-w-0">
        <section className="border border-line rounded-lg bg-surface p-4">
          <div className="flex items-baseline justify-between gap-3 mb-2">
            <h2>Progress</h2>
            <span className="mono text-sm font-semibold">{pct}%</span>
          </div>
          <MiniBar value={pct} stage={pct === 100 ? "done" : "ontrack"} />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 mt-4 mb-0 text-[13px]">
            <Mini label="Tasks done" value={`${realTasks.filter((t) => t.status === "done").length} of ${realTasks.length}`} />
            <Mini label="In progress" value={String(realTasks.filter((t) => t.status === "in_progress").length)} />
            <Mini label="Blocked" value={String(realTasks.filter((t) => t.status === "blocked").length)} alert={realTasks.some((t) => t.status === "blocked")} />
            <Mini label="Milestones left" value={String(milestones.filter((m) => !m.completion_date).length)} />
            <Mini label="Open risks" value={String(risks.filter((r) => r.status === "open").length)} />
            <Mini label="Progress reports" value={String(updates.filter((u) => u.kind === "note").length)} />
          </dl>
        </section>

        <section className="border border-line rounded-lg bg-surface">
          <div className="px-4 py-3 border-b border-line">
            <h2>Needs attention</h2>
          </div>
          {attention.length === 0 ? (
            <p className="text-[13.5px] text-ink-2 px-4 py-3.5">
              Nothing is late, every task has an owner, and no high risks are open.
            </p>
          ) : (
            <ul className="list-none m-0 p-0 divide-y divide-line">
              {attention.map((a) => (
                <li key={a.label}>
                  <button
                    className="w-full text-left px-4 py-2.5 hover:bg-raised transition"
                    onClick={() => setParams({ tab: a.tab }, { replace: true })}
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-flood shrink-0" />
                      <span className="text-[13.5px] font-semibold">{a.label}</span>
                    </span>
                    <span className="block text-[12.5px] text-ink-3 mt-0.5 pl-3.5 line-clamp-2">
                      {a.detail}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <ProjectLinks
          projectId={project.id}
          links={projectLinks}
          meId={me.id}
          onChanged={async (msg) => {
            setToast(msg);
            await reload();
          }}
        />
      </div>

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[132px_minmax(0,1fr)] gap-3 items-center px-4 py-2">
      <dt className="text-[13px] text-ink-2">{label}</dt>
      <dd className="m-0 min-w-0">{children}</dd>
    </div>
  );
}

function Mini({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-3 text-[12.5px] truncate">{label}</dt>
      <dd className={`mono m-0 font-semibold ${alert ? "text-flood" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ links */

function ProjectLinks({
  projectId,
  links,
  meId,
  onChanged,
}: {
  projectId: string;
  links: { id: string; url: string; label: string | null }[];
  meId: string;
  onChanged: (msg: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const { run, pending, error } = useAction();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    const ok = await run(() =>
      addLink({ project_id: projectId, url, label: label || null, added_by: meId })
    );
    if (ok) {
      setUrl("");
      setLabel("");
      setOpen(false);
      await onChanged("Link added");
    }
  }

  return (
    <section className="border border-line rounded-lg bg-surface">
      <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-3">
        <div>
          <h2>Data and documents</h2>
          <p className="text-[13px] text-ink-3 mt-0.5">Where this project&rsquo;s material lives.</p>
        </div>
        <button className="btn !px-2 !py-1.5 shrink-0" onClick={() => setOpen((v) => !v)} aria-label="Add a link">
          <Plus size={15} />
        </button>
      </div>

      {open && (
        <form onSubmit={submit} className="px-4 py-3 border-b border-line space-y-2.5 bg-raised">
          <input
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://drive.google.com/..."
            aria-label="Link address"
            className="field mono text-[13px]"
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="What it is, for example Gauge records 2026"
            aria-label="Link label"
            className="field text-[13px]"
          />
          {error && <ErrorNote message={error} />}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn !py-1 !text-[13px]" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary !py-1 !text-[13px]" disabled={pending || !url.trim()}>
              Add link
            </button>
          </div>
        </form>
      )}

      {links.length === 0 ? (
        <p className="text-[13px] text-ink-3 px-4 py-3.5">
          No links yet. Add the drive folder, the repository, or the paper so nobody has to ask where
          it is.
        </p>
      ) : (
        <ul className="list-none m-0 p-0 divide-y divide-line">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-2 px-4 py-2 group">
              <ExternalLink size={13} className="shrink-0 text-ink-3" />
              <a
                href={normalizeUrl(l.url)}
                target="_blank"
                rel="noreferrer"
                className="flex-1 min-w-0 text-[13.5px] truncate no-underline hover:underline"
                title={l.url}
              >
                {l.label || l.url}
              </a>
              <button
                className="btn btn-danger !px-1.5 !py-1 opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                aria-label={`Remove ${l.label || l.url}`}
                onClick={() =>
                  void (async () => {
                    await deleteLink(l.id);
                    await onChanged("Link removed");
                  })()
                }
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

