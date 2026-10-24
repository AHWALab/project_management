import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  isSameDay,
  isWeekend,
  max as maxDate,
  min as minDate,
  startOfWeek,
} from "date-fns";
import gsap from "gsap";
import { Check, ChevronDown, ChevronRight, CornerDownRight, Plus, Trash2 } from "lucide-react";
import type { TabProps } from "../pages/Project";
import {
  Avatar,
  DateCell,
  Dialog,
  EditableText,
  EmptyState,
  ErrorNote,
  StagePill,
  Toast,
} from "../components/bits";
import { addTask, changeTask, deleteTask, reconcileTask } from "../lib/db";
import { useAction, usePrefersReducedMotion } from "../lib/hooks";
import {
  fmtDate,
  isoDay,
  stageVar,
  taskStage,
  taskStatusLabel,
  toDate,
  type Stage,
} from "../lib/status";
import type { Member, Task } from "../lib/types";

type Zoom = "day" | "week" | "month";
const PX_PER_DAY: Record<Zoom, number> = { day: 26, week: 9, month: 3.2 };
const ROW_H = 34;

interface Node {
  task: Task;
  children: Task[];
  /** For a summary row: the span and completion rolled up from its children. */
  start: Date | null;
  end: Date | null;
  pct: number;
  stage: Stage;
}

export default function Timeline({ bundle, reload, patchTask, me }: TabProps) {
  const { project, tasks, members } = bundle;
  const { run, error } = useAction();
  const [toast, setToast] = useState<string | null>(null);
  const [zoom, setZoom] = useState<Zoom>("week");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Only the id is stored. The task itself is looked up from the live bundle
  // on every render, so a save that refreshes the bundle refreshes the panel.
  // Storing the object froze the panel at whatever it showed when opened.
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const openTask = useMemo(
    () => (openTaskId ? tasks.find((t) => t.id === openTaskId) ?? null : null),
    [tasks, openTaskId]
  );
  const [adding, setAdding] = useState<{ parent: Task | null } | null>(null);

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  /* ---------------------------------------------------------------- tree */

  const nodes = useMemo<Node[]>(() => {
    const byOrder = [...tasks].sort((a, b) => a.sort_order - b.sort_order);
    const childrenOf = new Map<string, Task[]>();
    for (const t of byOrder) {
      if (t.parent_id) {
        const list = childrenOf.get(t.parent_id);
        if (list) list.push(t);
        else childrenOf.set(t.parent_id, [t]);
      }
    }

    const out: Node[] = [];
    for (const t of byOrder) {
      if (t.parent_id) continue;
      const kids = childrenOf.get(t.id) ?? [];
      if (t.is_summary) {
        const starts = kids.map((k) => toDate(k.start_date)).filter(Boolean) as Date[];
        const ends = kids.map((k) => toDate(k.end_date)).filter(Boolean) as Date[];
        const pct = kids.length
          ? Math.round(kids.reduce((s, k) => s + k.pct_complete, 0) / kids.length)
          : 0;
        // A group is as late as its latest child.
        const worst: Stage = kids.some((k) => taskStage(k).stage === "overdue")
          ? "overdue"
          : kids.some((k) => taskStage(k).stage === "duesoon")
            ? "duesoon"
            : kids.length && kids.every((k) => k.status === "done")
              ? "done"
              : kids.length
                ? "ontrack"
                : "idle";
        out.push({
          task: t,
          children: kids,
          start: starts.length ? minDate(starts) : null,
          end: ends.length ? maxDate(ends) : null,
          pct,
          stage: worst,
        });
      } else {
        out.push({
          task: t,
          children: [],
          start: toDate(t.start_date),
          end: toDate(t.end_date),
          pct: t.pct_complete,
          stage: taskStage(t).stage,
        });
      }
    }
    return out;
  }, [tasks]);

  /** Rows actually drawn, after collapsing groups. */
  const rows = useMemo(() => {
    const out: { task: Task; node: Node; depth: number }[] = [];
    for (const n of nodes) {
      out.push({ task: n.task, node: n, depth: 0 });
      if (n.task.is_summary && !collapsed.has(n.task.id)) {
        for (const c of n.children) out.push({ task: c, node: n, depth: 1 });
      }
    }
    return out;
  }, [nodes, collapsed]);

  /* ----------------------------------------------------------- the axis */

  const axis = useMemo(() => {
    const dates: Date[] = [];
    for (const t of tasks) {
      const s = toDate(t.start_date);
      const e = toDate(t.end_date);
      if (s) dates.push(s);
      if (e) dates.push(e);
    }
    const ps = toDate(project.start_date);
    const pe = toDate(project.end_date);
    if (ps) dates.push(ps);
    if (pe) dates.push(pe);
    dates.push(new Date());

    const from = startOfWeek(addDays(minDate(dates), -3), { weekStartsOn: 1 });
    const to = addDays(maxDate(dates), 7);
    const days = Math.max(14, differenceInCalendarDays(to, from) + 1);
    return { from, days, width: days * PX_PER_DAY[zoom] };
  }, [tasks, project.start_date, project.end_date, zoom]);

  const xOf = (d: Date) => differenceInCalendarDays(d, axis.from) * PX_PER_DAY[zoom];

  /* --------------------------------------------------------- animation */

  const barsRef = useRef<HTMLDivElement | null>(null);
  const reduced = usePrefersReducedMotion();
  const animated = useRef(false);

  useEffect(() => {
    if (reduced || animated.current || !barsRef.current || rows.length === 0) return;
    animated.current = true;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-bar]",
        { scaleX: 0 },
        {
          scaleX: 1,
          duration: 0.42,
          ease: "power2.out",
          transformOrigin: "left center",
          stagger: 0.022,
        }
      );
    }, barsRef);
    return () => ctx.revert();
  }, [reduced, rows.length]);

  /* ----------------------------------------------------------- actions */

  const act = (fn: () => Promise<unknown>, msg?: string) =>
    void run(async () => {
      await fn();
      await reload();
      if (msg) setToast(msg);
    });

  async function createTask(parent: Task | null, title: string) {
    const siblings = parent
      ? tasks.filter((t) => t.parent_id === parent.id)
      : nodes.map((n) => n.task);
    const n = siblings.length + 1;
    const wbs = parent ? `${parent.wbs ?? "?"}.${n}` : `${n}.0`;
    const base = parent ? parent.sort_order : Math.max(0, ...tasks.map((t) => t.sort_order));
    await addTask({
      project_id: project.id,
      parent_id: parent?.id ?? null,
      is_summary: parent === null && title.trim().endsWith(":"),
      title: title.trim().replace(/:$/, ""),
      wbs,
      sort_order: parent ? base + n : base + 1000,
      start_date: parent ? null : project.start_date,
    });
  }

  if (tasks.length === 0) {
    return (
      <>
        <EmptyState
          title="No tasks yet"
          body="Add a few tasks with start and finish dates. They appear on the timeline, feed the RACI matrix, and are what the reminder emails look at."
          action={
            <button className="btn btn-primary" onClick={() => setAdding({ parent: null })}>
              <Plus size={15} />
              Add the first task
            </button>
          }
        />
        <AddTaskDialog
          open={adding !== null}
          parent={adding?.parent ?? null}
          onClose={() => setAdding(null)}
          onSubmit={async (title) => {
            await createTask(adding?.parent ?? null, title);
            await reload();
            setAdding(null);
          }}
        />
      </>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-3">
          <ErrorNote message={error} />
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button className="btn" onClick={() => setAdding({ parent: null })}>
            <Plus size={15} />
            Add task
          </button>
          <button
            className="btn"
            onClick={() =>
              setCollapsed((prev) =>
                prev.size > 0 ? new Set() : new Set(nodes.filter((n) => n.task.is_summary).map((n) => n.task.id))
              )
            }
            disabled={!nodes.some((n) => n.task.is_summary)}
          >
            {collapsed.size > 0 ? "Expand groups" : "Collapse groups"}
          </button>
        </div>

        <div className="flex items-center gap-1 border border-line rounded-md p-0.5 bg-surface">
          {(["day", "week", "month"] as Zoom[]).map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              aria-pressed={zoom === z}
              className="px-2.5 py-1 rounded text-[13px] font-semibold capitalize transition"
              style={{
                background: zoom === z ? "var(--c-reach)" : "transparent",
                color: zoom === z ? "#fff" : "var(--c-ink-2)",
              }}
            >
              {z}
            </button>
          ))}
        </div>
      </div>

      <div className="border border-line rounded-lg bg-surface overflow-hidden">
        <div className="flex">
          {/* ------------------------------------------------- task table */}
          <div className="shrink-0 border-r border-line-strong" style={{ width: 468 }}>
            <HeaderCells />
            <div>
              {rows.map(({ task, node, depth }) => {
                const isGroup = task.is_summary;
                const owner = task.owner_id ? memberById.get(task.owner_id) : undefined;
                return (
                  <div
                    key={task.id}
                    className="grid items-center gap-1.5 px-2.5 border-b border-line hover:bg-raised transition group"
                    style={{
                      height: ROW_H,
                      gridTemplateColumns: "42px minmax(0,1fr) 24px 68px 34px",
                    }}
                  >
                    <span className="mono text-[11.5px] text-ink-3 truncate" title={task.wbs ?? ""}>
                      {task.wbs}
                    </span>

                    <span
                      className="min-w-0 flex items-center gap-1"
                      style={{ paddingLeft: depth * 12 }}
                    >
                      {isGroup ? (
                        <button
                          onClick={() =>
                            setCollapsed((prev) => {
                              const next = new Set(prev);
                              if (next.has(task.id)) next.delete(task.id);
                              else next.add(task.id);
                              return next;
                            })
                          }
                          className="shrink-0 text-ink-3 hover:text-ink"
                          aria-label={collapsed.has(task.id) ? `Expand ${task.title}` : `Collapse ${task.title}`}
                        >
                          {collapsed.has(task.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        </button>
                      ) : (
                        depth > 0 && <CornerDownRight size={11} className="shrink-0 text-ink-3 opacity-50" />
                      )}
                      <button
                        onClick={() => setOpenTaskId(task.id)}
                        className={`truncate text-left text-[13.5px] hover:underline ${isGroup ? "font-bold" : ""} ${task.status === "done" ? "text-ink-3 line-through decoration-1" : ""}`}
                        title={task.title}
                      >
                        {task.title}
                      </button>
                    </span>

                    {owner ? (
                      <Avatar
                        name={owner.display_name}
                        email={owner.invited_email}
                        size={21}
                        title={`Owner: ${owner.display_name}`}
                        dimmed={!owner.user_id}
                      />
                    ) : (
                      <span />
                    )}

                    <span className="mono text-[11.5px] text-ink-2 truncate">
                      {isGroup
                        ? node.end
                          ? format(node.end, "d MMM")
                          : ""
                        : task.end_date
                          ? format(toDate(task.end_date) as Date, "d MMM")
                          : "no date"}
                    </span>

                    {isGroup ? (
                      <span className="mono text-[11.5px] text-ink-3 text-right">{node.pct}%</span>
                    ) : (
                      <button
                        onClick={() => {
                          const patch = { status: task.status === "done" ? "in_progress" : "done" } as const;
                          const settle = patchTask(task.id, reconcileTask(task, patch));
                          act(
                            async () => {
                              try {
                                await changeTask(task, patch, { id: me.id, name: me.name });
                              } finally {
                                settle();
                              }
                            },
                            task.status === "done" ? "Task reopened" : "Task marked done"
                          );
                        }}
                        aria-label={task.status === "done" ? `Reopen ${task.title}` : `Mark ${task.title} done`}
                        aria-pressed={task.status === "done"}
                        className="justify-self-end grid place-items-center rounded transition"
                        style={{
                          width: 20,
                          height: 20,
                          border: `1.5px solid ${task.status === "done" ? "var(--c-done)" : "var(--c-line-strong)"}`,
                          background: task.status === "done" ? "var(--c-done)" : "transparent",
                        }}
                        title={task.status === "done" ? "Done. Click to reopen." : "Mark done"}
                      >
                        {task.status === "done" && <Check size={13} color="#fff" strokeWidth={3} />}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ---------------------------------------------------- the bars */}
          <div className="flex-1 min-w-0 overflow-x-auto thin-scroll">
            <div style={{ width: axis.width, minWidth: "100%" }}>
              <AxisHeader from={axis.from} days={axis.days} zoom={zoom} />
              <div ref={barsRef} className="relative">
                {/* Column shading and the today line sit behind the bars. */}
                <Grid from={axis.from} days={axis.days} zoom={zoom} rows={rows.length} />

                {rows.map(({ task, node }) => {
                  const isGroup = task.is_summary;
                  const s = isGroup ? node.start : toDate(task.start_date);
                  const e = isGroup ? node.end : toDate(task.end_date);
                  const stage = isGroup ? node.stage : taskStage(task).stage;
                  const pct = isGroup ? node.pct : task.pct_complete;

                  if (!s || !e) {
                    return (
                      <div
                        key={task.id}
                        className="relative border-b border-line"
                        style={{ height: ROW_H }}
                      >
                      </div>
                    );
                  }

                  const left = xOf(s);
                  const width = Math.max(
                    PX_PER_DAY[zoom] * 0.9,
                    (differenceInCalendarDays(e, s) + 1) * PX_PER_DAY[zoom]
                  );

                  return (
                    <div key={task.id} className="relative border-b border-line" style={{ height: ROW_H }}>
                      <button
                        data-bar
                        onClick={() => setOpenTaskId(task.id)}
                        title={`${task.title}\n${fmtDate(isoDay(s))} to ${fmtDate(isoDay(e))}\n${pct}% complete`}
                        className="absolute top-1/2 -translate-y-1/2 text-left"
                        style={{
                          left,
                          width,
                          height: isGroup ? 9 : 17,
                          zIndex: 2,
                          cursor: "pointer",
                        }}
                      >
                        {isGroup ? (
                          /* A group reads as a bracket spanning its children,
                             not as another bar competing with them. */
                          <span
                            className="block w-full h-full"
                            style={{
                              borderTop: `3px solid ${stageVar[stage]}`,
                              borderLeft: `3px solid ${stageVar[stage]}`,
                              borderRight: `3px solid ${stageVar[stage]}`,
                              borderRadius: "2px 2px 0 0",
                              opacity: 0.85,
                            }}
                          />
                        ) : (
                          <span
                            className="block w-full h-full rounded-sm overflow-hidden"
                            style={{
                              background: `color-mix(in srgb, ${stageVar[stage]} 22%, var(--c-surface))`,
                              border: `1px solid ${stageVar[stage]}`,
                            }}
                          >
                            <span
                              className="block h-full"
                              style={{
                                width: `${pct}%`,
                                background: stageVar[stage],
                                transition: "width 260ms ease",
                              }}
                            />
                          </span>
                        )}
                      </button>
                      {!isGroup && width > 54 && (
                        <span
                          className="mono absolute top-1/2 -translate-y-1/2 text-[10px] font-semibold pointer-events-none"
                          style={{ left: left + width + 6, color: "var(--c-ink-3)", zIndex: 3 }}
                        >
                          {pct > 0 ? `${pct}%` : ""}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="text-[12.5px] text-ink-3 mt-2.5">
        Click a task name or its bar to edit dates, owner, and progress. A task whose title you end
        with a colon becomes a group heading.
      </p>

      <TaskPanel
        task={openTask}
        members={members}
        me={me}
        onPatch={patchTask}
        onClose={() => setOpenTaskId(null)}
        onChanged={async (msg) => {
          await reload();
          if (msg) setToast(msg);
        }}
        onDeleted={async () => {
          setOpenTaskId(null);
          await reload();
          setToast("Task deleted");
        }}
      />

      <AddTaskDialog
        open={adding !== null}
        parent={adding?.parent ?? null}
        onClose={() => setAdding(null)}
        onSubmit={async (title) => {
          await createTask(adding?.parent ?? null, title);
          await reload();
          setAdding(null);
        }}
      />

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

/* --------------------------------------------------------------- chrome */

function HeaderCells() {
  return (
    <div
      className="grid items-center gap-1.5 px-2.5 border-b border-line-strong bg-raised"
      style={{ height: 46, gridTemplateColumns: "42px minmax(0,1fr) 24px 68px 34px" }}
    >
      <span className="text-[11px] font-bold text-ink-3">WBS</span>
      <span className="text-[11px] font-bold text-ink-3">Task</span>
      <span />
      <span className="text-[11px] font-bold text-ink-3">Finish</span>
      <span className="text-[11px] font-bold text-ink-3 text-right">Done</span>
    </div>
  );
}

function AxisHeader({ from, days, zoom }: { from: Date; days: number; zoom: Zoom }) {
  const px = PX_PER_DAY[zoom];
  const all = eachDayOfInterval({ start: from, end: addDays(from, days - 1) });

  // Weeks are the shared unit: labelled on every zoom, with day numbers only
  // when there is room for them.
  const weeks: { start: Date; width: number }[] = [];
  for (const d of all) {
    if (d.getDay() === 1 || weeks.length === 0) weeks.push({ start: d, width: px });
    else weeks[weeks.length - 1].width += px;
  }

  return (
    <div className="border-b border-line-strong bg-raised" style={{ height: 46 }}>
      <div className="flex" style={{ height: 24 }}>
        {weeks.map((w) => (
          <div
            key={w.start.toISOString()}
            className="shrink-0 border-r border-line overflow-hidden"
            style={{ width: w.width }}
          >
            <span className="mono text-[10.5px] text-ink-2 pl-1.5 whitespace-nowrap font-medium">
              {w.width > 46 ? format(w.start, "d MMM") : w.width > 24 ? format(w.start, "d") : ""}
            </span>
          </div>
        ))}
      </div>
      <div className="flex" style={{ height: 21 }}>
        {zoom === "day"
          ? all.map((d) => (
              <div
                key={d.toISOString()}
                className="shrink-0 grid place-items-center"
                style={{ width: px, background: isWeekend(d) ? "var(--c-slack-soft)" : undefined }}
              >
                <span
                  className={`mono text-[10px] ${isSameDay(d, new Date()) ? "text-reach font-bold" : "text-ink-3"}`}
                >
                  {format(d, "EEEEE")}
                </span>
              </div>
            ))
          : /* Month names rather than week numbers: a week number counted from
               the left edge of the axis means nothing to anyone. */
            weeks.map((w, i) => {
              const newMonth = i === 0 || w.start.getMonth() !== weeks[i - 1].start.getMonth();
              return (
                <div
                  key={w.start.toISOString()}
                  className="shrink-0 border-r border-line"
                  style={{ width: w.width }}
                >
                  {newMonth && (
                    <span className="text-[10.5px] font-semibold text-ink-2 pl-1.5 whitespace-nowrap">
                      {format(w.start, "MMMM")}
                    </span>
                  )}
                </div>
              );
            })}
      </div>
    </div>
  );
}

function Grid({
  from,
  days,
  zoom,
  rows,
}: {
  from: Date;
  days: number;
  zoom: Zoom;
  rows: number;
}) {
  const px = PX_PER_DAY[zoom];
  const height = rows * ROW_H;
  const today = new Date();
  const todayX = differenceInCalendarDays(today, from) * px;
  const all = eachDayOfInterval({ start: from, end: addDays(from, days - 1) });

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ height }} aria-hidden="true">
      {zoom === "day" &&
        all.map((d, i) =>
          isWeekend(d) ? (
            <span
              key={i}
              className="absolute top-0 bottom-0"
              style={{ left: i * px, width: px, background: "var(--c-slack-soft)", opacity: 0.6 }}
            />
          ) : null
        )}
      {all.map((d, i) =>
        d.getDay() === 1 ? (
          <span
            key={`w${i}`}
            className="absolute top-0 bottom-0"
            style={{ left: i * px, width: 1, background: "var(--c-line)" }}
          />
        ) : null
      )}
      {todayX >= 0 && (
        <span
          className="absolute top-0 bottom-0"
          style={{ left: todayX, width: 2, background: "var(--c-reach)", opacity: 0.55 }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------ add dialog */

function AddTaskDialog({
  open,
  parent,
  onClose,
  onSubmit,
}: {
  open: boolean;
  parent: Task | null;
  onClose: () => void;
  onSubmit: (title: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const { run, pending, error } = useAction();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const ok = await run(() => onSubmit(title));
    if (ok) setTitle("");
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={parent ? `Add a task under ${parent.title}` : "Add a task"}
      description="End the title with a colon to make it a group heading instead."
      width={460}
    >
      <form onSubmit={submit} className="space-y-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Collect input data"
          aria-label="Task title"
          className="field"
          required
        />
        {error && <ErrorNote message={error} />}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={pending || !title.trim()}>
            {pending ? "Adding" : "Add task"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/* ----------------------------------------------------------- task panel */

function TaskPanel({
  task,
  members,
  me,
  onPatch,
  onClose,
  onChanged,
  onDeleted,
}: {
  task: Task | null;
  members: Member[];
  me: { id: string; name: string };
  onPatch: (id: string, patch: Partial<Task>) => () => void;
  onClose: () => void;
  onChanged: (msg?: string) => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const { run, error } = useAction();
  const [confirming, setConfirming] = useState(false);
  /** Slider position while a drag is in progress; null when idle. */
  const [dragPct, setDragPct] = useState<number | null>(null);
  const commitRef = useRef<() => void>(() => {});

  useEffect(() => {
    setConfirming(false);
    setDragPct(null);
  }, [task?.id]);

  // Safety net: if the slider has been left on a value for a while with no
  // release event arriving, save it anyway. Normal drags save on release.
  useEffect(() => {
    if (dragPct === null) return;
    const t = setTimeout(() => commitRef.current(), 1500);
    return () => clearTimeout(t);
  }, [dragPct]);

  if (!task) return null;
  const stage = taskStage(task);

  /**
   * Every edit in this panel goes through here. The change shows on screen at
   * once, then is written, then the fresh row replaces the optimistic copy.
   * Status and percentage are reconciled so they cannot contradict each other.
   */
  const save = (patch: Partial<Task>) => {
    const fields = reconcileTask(task, patch);
    if (Object.keys(fields).length === 0) return;
    const settle = onPatch(task.id, fields);
    const wasDone = task.status === "done";
    const isDone = (fields.status ?? task.status) === "done";
    const msg = isDone && !wasDone ? "Task marked done" : !isDone && wasDone ? "Task reopened" : undefined;
    void run(async () => {
      try {
        await changeTask(task, patch, me);
      } finally {
        settle();
      }
      await onChanged(msg);
    });
  };

  const commitDrag = () => {
    if (dragPct === null) return;
    const v = dragPct;
    setDragPct(null);
    if (v !== task.pct_complete) save({ pct_complete: v });
  };
  commitRef.current = commitDrag;

  return (
    <Dialog open onClose={onClose} title={task.is_summary ? "Group" : "Task"} width={560}>
      <div className="space-y-4">
        <div>
          {/* Multiline so a long task name wraps instead of scrolling out of
              sight, but newlines are collapsed because a title is one line. */}
          <EditableText
            value={task.title}
            ariaLabel="Task title"
            multiline
            onSave={(v) => v && save({ title: v.replace(/\s+/g, " ").trim() })}
            className="!text-[17px] font-semibold !leading-snug"
          />
          <div className="flex items-center gap-2 mt-1.5">
            <span className="mono text-[12px] text-ink-3">{task.wbs}</span>
            {!task.is_summary && <StagePill stage={stage.stage}>{stage.label}</StagePill>}
          </div>
        </div>

        {!task.is_summary && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Labeled label="Start">
                <DateCell
                  value={task.start_date}
                  ariaLabel="Start date"
                  onSave={(v) => save({ start_date: v })}
                />
              </Labeled>
              <Labeled label="Finish">
                <DateCell
                  value={task.end_date}
                  ariaLabel="Finish date"
                  onSave={(v) => save({ end_date: v })}
                />
              </Labeled>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Labeled label="Owner">
                <select
                  aria-label="Owner"
                  value={task.owner_id ?? ""}
                  onChange={(e) => save({ owner_id: e.target.value || null })}
                  className="qf"
                >
                  <option value="">Nobody yet</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.display_name}
                      {m.role ? ` (${m.role})` : ""}
                    </option>
                  ))}
                </select>
              </Labeled>
              <Labeled label="Status">
                <select
                  aria-label="Status"
                  value={task.status}
                  onChange={(e) => save({ status: e.target.value as Task["status"] })}
                  className="qf"
                >
                  {(Object.keys(taskStatusLabel) as Task["status"][]).map((s) => (
                    <option key={s} value={s}>
                      {taskStatusLabel[s]}
                    </option>
                  ))}
                </select>
              </Labeled>
            </div>

            {/* One bar only. An identical looking read only bar used to sit
                underneath this slider, which made it unclear which of the two
                you were meant to drag. */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="pct" className="text-[13px] font-semibold">
                  Progress
                </label>
                <span className="mono text-[15px] font-bold">{dragPct ?? task.pct_complete}%</span>
              </div>
              {/* The slider follows your hand locally and saves once on release.
                  Saving on every pixel sent dozens of writes per drag, and the
                  last one to land was not always the last one you made. */}
              <input
                id="pct"
                type="range"
                min={0}
                max={100}
                step={5}
                value={dragPct ?? task.pct_complete}
                onChange={(e) => setDragPct(Number(e.target.value))}
                onPointerUp={commitDrag}
                onKeyUp={commitDrag}
                onBlur={commitDrag}
                className="w-full"
                style={{ accentColor: "var(--c-reach)", height: 22 }}
              />
              <div className="flex gap-1.5 mt-1" role="group" aria-label="Set progress">
                {[0, 25, 50, 75, 100].map((v) => (
                  <button
                    key={v}
                    onClick={() => v !== task.pct_complete && save({ pct_complete: v })}
                    aria-pressed={task.pct_complete === v}
                    className="mono flex-1 rounded py-1 text-[12px] font-semibold transition"
                    style={{
                      border: `1px solid ${task.pct_complete === v ? "var(--c-reach)" : "var(--c-line)"}`,
                      background: task.pct_complete === v ? "var(--c-reach)" : "transparent",
                      color: task.pct_complete === v ? "#fff" : "var(--c-ink-2)",
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <p className="text-[12px] text-ink-3 mt-1.5">
                Drag the slider or pick a value. Setting it to 100 marks the task done.
              </p>
            </div>
          </>
        )}

        <Labeled label="Notes">
          <EditableText
            value={task.description}
            ariaLabel="Task notes"
            multiline
            placeholder="What this involves, where the data is, anything the next person needs"
            onSave={(v) => save({ description: v })}
            className="text-[14px]"
          />
        </Labeled>

        {error && <ErrorNote message={error} />}

        <div className="flex items-center justify-between gap-3 pt-3 border-t border-line">
          {confirming ? (
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-ink-2">
                Delete this {task.is_summary ? "group and its tasks" : "task"}?
              </span>
              <button
                className="btn btn-danger !py-1 !text-[13px]"
                onClick={() => void run(async () => {
                  await deleteTask(task.id);
                  await onDeleted();
                })}
              >
                Delete
              </button>
              <button className="btn !py-1 !text-[13px]" onClick={() => setConfirming(false)}>
                Keep
              </button>
            </div>
          ) : (
            <button className="btn btn-danger !px-2 !py-1.5" onClick={() => setConfirming(true)} aria-label="Delete task">
              <Trash2 size={14} />
            </button>
          )}
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-ink-3">
              {task.completed_at ? `Completed ${fmtDate(task.completed_at.slice(0, 10))}` : ""}
            </span>
            <button className="btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <p className="text-[12px] text-ink-3">
          Progress notes and links live on the Activity tab, where the whole team can see them. This
          panel is for the plan.
        </p>
      </div>
    </Dialog>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="block text-[13px] font-semibold mb-1">{label}</span>
      {children}
    </div>
  );
}
