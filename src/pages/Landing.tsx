import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { addDays } from "date-fns";
import { Plus, Search } from "lucide-react";
import Shell from "../components/Shell";
import Ribbon, { type DueItem } from "../components/Ribbon";
import {
  AvatarRow,
  Dialog,
  EmptyState,
  ErrorNote,
  ProgressDial,
  Spinner,
  StagePill,
} from "../components/bits";
import { useAction, useProjects, type Me } from "../lib/hooks";
import { createProject, fetchDueItems, fetchMyMemberships } from "../lib/db";
import { fmtDate, isoDay, projectStage, relativeTime, taskStage, milestoneStage } from "../lib/status";
import type { Member, ProjectRollup } from "../lib/types";

export default function Landing({ me }: { me: Me }) {
  const { rows, error, reload, loading } = useProjects();
  const [members, setMembers] = useState<Member[]>([]);
  const [due, setDue] = useState<DueItem[]>([]);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  // The roster and the due list are both small and only needed here.
  useEffect(() => {
    if (!rows) return;
    const names = new Map(rows.map((p) => [p.id, p.name]));

    void fetchMyMemberships()
      .then(setMembers)
      .catch(() => setMembers([]));

    void fetchDueItems(isoDay(addDays(new Date(), 21)))
      .then(({ tasks, milestones }) => {
        const items: DueItem[] = [];
        for (const t of tasks) {
          if (!names.has(t.project_id) || !t.end_date) continue;
          items.push({
            id: `t-${t.id}`,
            project_id: t.project_id,
            project_name: names.get(t.project_id) ?? "",
            title: t.title,
            due: t.end_date,
            stage: taskStage(t).stage,
            kind: "task",
          });
        }
        for (const m of milestones) {
          if (!names.has(m.project_id) || !m.due_date) continue;
          items.push({
            id: `m-${m.id}`,
            project_id: m.project_id,
            project_name: names.get(m.project_id) ?? "",
            title: m.title,
            due: m.due_date,
            stage: milestoneStage(m).stage,
            kind: "milestone",
          });
        }
        setDue(items);
      })
      .catch(() => setDue([]));
  }, [rows]);

  const membersByProject = useMemo(() => {
    const map = new Map<string, Member[]>();
    for (const m of members) {
      const list = map.get(m.project_id);
      if (list) list.push(m);
      else map.set(m.project_id, [m]);
    }
    return map;
  }, [members]);

  const visible = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    const active = rows.filter((p) => p.status !== "archived");
    if (!q) return active;
    return active.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.code ?? "").toLowerCase().includes(q) ||
        (p.summary ?? "").toLowerCase().includes(q)
    );
  }, [rows, query]);

  const archived = useMemo(() => (rows ?? []).filter((p) => p.status === "archived"), [rows]);

  return (
    <Shell
      me={me}
      actions={
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus size={15} />
          <span className="hidden sm:inline">New project</span>
        </button>
      }
    >
      {loading && <Spinner label="Loading your projects" />}
      {error && <ErrorNote message={error} />}

      {rows && rows.length > 0 && (
        <div className="mb-8">
          <Ribbon items={due} />
        </div>
      )}

      {rows && rows.length === 0 && !error && (
        <div className="mt-6">
          <EmptyState
            title="No projects yet"
            body="Create the first one. You can add your lab mates and collaborators to it straight away, and build out the timeline and the RACI matrix once it exists."
            action={
              <button className="btn btn-primary" onClick={() => setCreating(true)}>
                <Plus size={15} />
                Create a project
              </button>
            }
          />
        </div>
      )}

      {rows && rows.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-4 mb-3">
            <h2>
              {visible.length} {visible.length === 1 ? "project" : "projects"}
            </h2>
            <label className="relative shrink-0" style={{ width: 230 }}>
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter projects"
                aria-label="Filter projects"
                className="field !py-1.5 !pl-8 text-sm"
              />
            </label>
          </div>

          {visible.length === 0 ? (
            <p className="text-sm text-ink-2 py-6">
              Nothing matches &ldquo;{query}&rdquo;.
            </p>
          ) : (
            <ul className="grid gap-3 list-none p-0 m-0" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(282px, 1fr))" }}>
              {visible.map((p) => (
                <ProjectTile key={p.id} project={p} members={membersByProject.get(p.id) ?? []} />
              ))}
            </ul>
          )}

          {archived.length > 0 && (
            <details className="mt-7">
              <summary className="text-sm text-ink-2 cursor-pointer">
                {archived.length} archived
              </summary>
              <ul className="list-none p-0 mt-2.5 space-y-1">
                {archived.map((p) => (
                  <li key={p.id}>
                    <Link to={`/project/${p.id}`} className="text-sm no-underline hover:underline">
                      {p.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      <NewProject
        open={creating}
        onClose={() => setCreating(false)}
        me={me}
        onCreated={() => {
          setCreating(false);
          void reload();
        }}
      />
    </Shell>
  );
}

/* ------------------------------------------------------------------- tile */

function ProjectTile({ project, members }: { project: ProjectRollup; members: Member[] }) {
  const stage = projectStage(project);
  const pct =
    project.task_count > 0 ? Math.round((project.task_done / project.task_count) * 100) : 0;

  const edge =
    stage.stage === "overdue"
      ? "var(--c-flood)"
      : stage.stage === "duesoon"
        ? "var(--c-stage)"
        : stage.stage === "done"
          ? "var(--c-done)"
          : stage.stage === "idle"
            ? "var(--c-slack)"
            : "var(--c-reach)";

  return (
    <li>
      <Link
        to={`/project/${project.id}`}
        className="group block h-full no-underline bg-surface border border-line rounded-lg overflow-hidden transition"
        style={{ color: "var(--c-ink)" }}
      >
        <div className="flex h-full">
          {/* The edge carries the project's worst current reading, so a wall of
              tiles can be scanned without reading a word. */}
          <span
            aria-hidden="true"
            className="shrink-0 transition-all"
            style={{ width: 4, background: edge }}
          />
          <div className="flex-1 min-w-0 p-3.5">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                {project.code && (
                  <div className="mono text-[11px] text-ink-3 mb-0.5 truncate">{project.code}</div>
                )}
                <h3 className="line-clamp-2 group-hover:underline" title={project.name}>
                  {project.name}
                </h3>
                <div className="mt-1.5">
                  <StagePill stage={stage.stage}>{stage.label}</StagePill>
                </div>
              </div>
              <ProgressDial value={pct} stage={stage.stage} size={46} />
            </div>

            {project.summary && (
              <p className="text-[13px] text-ink-2 mt-2.5 line-clamp-2" style={{ maxWidth: "none" }}>
                {project.summary}
              </p>
            )}

            <dl className="grid grid-cols-3 gap-2 mt-3 mb-0 text-[12px]">
              <Stat label="Tasks" value={`${project.task_done}/${project.task_count}`} />
              <Stat
                label="Milestones"
                value={project.milestones_open === 0 ? "none open" : String(project.milestones_open)}
              />
              <Stat
                label="High risks"
                value={project.risks_high === 0 ? "none" : String(project.risks_high)}
                alert={project.risks_high > 0}
              />
            </dl>

            <div className="flex items-center justify-between gap-2 mt-3.5 pt-3 border-t border-line">
              <AvatarRow people={members} size={23} />
              <span className="text-[11.5px] text-ink-3 truncate">
                {project.last_activity
                  ? relativeTime(project.last_activity)
                  : project.next_due
                    ? `next ${fmtDate(project.next_due)}`
                    : "no activity yet"}
              </span>
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}

function Stat({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-3 truncate">{label}</dt>
      <dd
        className={`mono font-semibold truncate m-0 ${alert ? "text-flood" : "text-ink"}`}
        style={{ fontSize: 12.5 }}
      >
        {value}
      </dd>
    </div>
  );
}

/* --------------------------------------------------------------- new project */

function NewProject({
  open,
  onClose,
  me,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  me: Me;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [summary, setSummary] = useState("");
  const [start, setStart] = useState(isoDay(new Date()));
  const [end, setEnd] = useState("");
  const { run, pending, error } = useAction();
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    let newId: string | null = null;
    const ok = await run(async () => {
      const p = await createProject({
        name: name.trim(),
        code: code.trim() || null,
        summary: summary.trim() || null,
        start_date: start || null,
        end_date: end || null,
        ownerName: me.name,
      });
      newId = p.id;
    });
    if (ok) {
      setName("");
      setCode("");
      setSummary("");
      setEnd("");
      onCreated();
      if (newId) navigate(`/project/${newId}`);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New project"
      description="You can change all of this later. Only the name is needed now."
    >
      <form onSubmit={submit} className="space-y-3.5">
        <div>
          <label htmlFor="np-name" className="block text-sm font-semibold mb-1">
            Project name
          </label>
          <input
            id="np-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Low flow and hydrological drought thresholds"
            className="field"
          />
        </div>

        <div>
          <label htmlFor="np-code" className="block text-sm font-semibold mb-1">
            Short code <span className="font-normal text-ink-3">optional</span>
          </label>
          <input
            id="np-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="FY26-087"
            className="field mono"
          />
        </div>

        <div>
          <label htmlFor="np-summary" className="block text-sm font-semibold mb-1">
            One line summary <span className="font-normal text-ink-3">optional</span>
          </label>
          <input
            id="np-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Evaluate NWM low flow against observed drought thresholds"
            className="field"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="np-start" className="block text-sm font-semibold mb-1">
              Start
            </label>
            <input
              id="np-start"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="field mono"
            />
          </div>
          <div>
            <label htmlFor="np-end" className="block text-sm font-semibold mb-1">
              Target finish
            </label>
            <input
              id="np-end"
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="field mono"
            />
          </div>
        </div>

        {error && <ErrorNote message={error} />}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={pending || !name.trim()}>
            {pending ? "Creating" : "Create project"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
