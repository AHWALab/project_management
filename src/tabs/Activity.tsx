import { useMemo, useState } from "react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { CheckCircle2, ExternalLink, Link2, RotateCcw, Trash2 } from "lucide-react";
import type { TabProps } from "../pages/Project";
import { Avatar, EmptyState, ErrorNote, Toast } from "../components/bits";
import { addLink, addUpdate, deleteUpdate, normalizeUrl } from "../lib/db";
import { useAction } from "../lib/hooks";
import { relativeTime } from "../lib/status";
import type { LinkRow, Update } from "../lib/types";

export default function Activity({ bundle, reload, me }: TabProps) {
  const { project, updates, tasks, milestones, members, links } = bundle;
  const { run, error } = useAction();
  const [toast, setToast] = useState<string | null>(null);

  const [body, setBody] = useState("");
  const [taskId, setTaskId] = useState("");
  const [url, setUrl] = useState("");
  const [showLink, setShowLink] = useState(false);
  const [filter, setFilter] = useState<string>("");

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const msById = useMemo(() => new Map(milestones.map((m) => [m.id, m])), [milestones]);

  const linksByUpdate = useMemo(() => {
    const map = new Map<string, LinkRow[]>();
    for (const l of links) {
      if (!l.update_id) continue;
      const list = map.get(l.update_id);
      if (list) list.push(l);
      else map.set(l.update_id, [l]);
    }
    return map;
  }, [links]);

  const shown = useMemo(() => {
    const list = filter ? updates.filter((u) => u.author_id === filter) : updates;
    // The query already orders newest first, but a realtime refetch or a cached
    // response arriving out of order would scramble the day headings, so the
    // ordering is enforced here too.
    return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [updates, filter]);

  /** Grouped by day so a long feed stays readable. */
  const groups = useMemo(() => {
    const out: { label: string; items: Update[] }[] = [];
    for (const u of shown) {
      const d = parseISO(u.created_at);
      const label = isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : format(d, "EEEE d MMMM yyyy");
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(u);
      else out.push({ label, items: [u] });
    }
    return out;
  }, [shown]);

  const authors = useMemo(() => {
    const seen = new Map<string, string>();
    for (const u of updates) {
      if (u.author_id && !seen.has(u.author_id)) seen.set(u.author_id, u.author_name ?? "Someone");
    }
    return [...seen.entries()];
  }, [updates]);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text && !url.trim()) return;
    const ok = await run(async () => {
      const update = await addUpdate({
        project_id: project.id,
        task_id: taskId || null,
        author_id: me.id,
        author_name: me.name,
        body: text || null,
        kind: "note",
      });
      if (url.trim()) {
        await addLink({
          project_id: project.id,
          update_id: update.id,
          task_id: taskId || null,
          url,
          added_by: me.id,
        });
      }
      await reload();
    });
    if (ok) {
      setBody("");
      setUrl("");
      setTaskId("");
      setShowLink(false);
      setToast("Progress reported");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px] items-start">
      <div className="min-w-0 space-y-5">
        {error && <ErrorNote message={error} />}

        {/* -------------------------------------------------------- composer */}
        <form onSubmit={post} className="border border-line rounded-lg bg-surface">
          <div className="flex gap-3 p-3.5">
            <Avatar name={me.name} email={me.email} size={30} />
            <div className="flex-1 min-w-0 space-y-2.5">
              <label htmlFor="report" className="sr-only">
                What happened
              </label>
              <textarea
                id="report"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={body.split("\n").length > 2 ? 5 : 3}
                placeholder="What moved, what is stuck, what you need from someone else."
                className="field !py-2 text-[14.5px] resize-y"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void post(e as unknown as React.FormEvent);
                  }
                }}
              />

              {showLink && (
                <input
                  autoFocus
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Paste a link to the data, notebook, or document"
                  aria-label="Link to attach"
                  className="field mono !py-1.5 text-[13px]"
                />
              )}

              <div className="flex items-center gap-2 flex-wrap">
                <label className="sr-only" htmlFor="about">
                  Which task this is about
                </label>
                <select
                  id="about"
                  value={taskId}
                  onChange={(e) => setTaskId(e.target.value)}
                  className="btn !py-1 !text-[13px]"
                  style={{ maxWidth: 260 }}
                >
                  <option value="">About the project</option>
                  {tasks
                    .filter((t) => !t.is_summary)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.wbs ? `${t.wbs} ` : ""}
                        {t.title}
                      </option>
                    ))}
                </select>

                <button
                  type="button"
                  className="btn !py-1 !text-[13px]"
                  onClick={() => setShowLink((v) => !v)}
                  aria-pressed={showLink}
                >
                  <Link2 size={14} />
                  {showLink ? "Remove link" : "Attach a link"}
                </button>

                <span className="flex-1" />

                <button
                  type="submit"
                  className="btn btn-primary !py-1 !text-[13px]"
                  disabled={!body.trim() && !url.trim()}
                >
                  Post
                </button>
              </div>
            </div>
          </div>
        </form>

        {/* ------------------------------------------------------------ feed */}
        {updates.length === 0 ? (
          <EmptyState
            title="Nothing reported yet"
            body="This is where the team writes what happened. Marking a task done also lands here, so the record builds itself as work gets finished."
          />
        ) : shown.length === 0 ? (
          <p className="text-sm text-ink-2 py-4">
            Nothing from that person yet.{" "}
            <button className="text-reach hover:underline" onClick={() => setFilter("")}>
              Show everyone
            </button>
          </p>
        ) : (
          groups.map((g) => (
            <section key={g.label}>
              <h2 className="text-[13px] font-bold text-ink-3 mb-2">{g.label}</h2>
              <ul className="list-none m-0 p-0 space-y-2">
                {g.items.map((u) => {
                  const task = u.task_id ? taskById.get(u.task_id) : undefined;
                  const ms = u.milestone_id ? msById.get(u.milestone_id) : undefined;
                  const myLinks = linksByUpdate.get(u.id) ?? [];
                  const system = u.kind !== "note";
                  return (
                    <li
                      key={u.id}
                      className="border border-line rounded-lg bg-surface p-3 group"
                      style={system ? { background: "var(--c-raised)" } : undefined}
                    >
                      <div className="flex gap-3">
                        <div className="shrink-0 pt-0.5">
                          {system ? (
                            <span
                              className="grid place-items-center rounded-full"
                              style={{
                                width: 28,
                                height: 28,
                                background:
                                  u.kind === "reopened" ? "var(--c-stage-soft)" : "var(--c-done-soft)",
                                color: u.kind === "reopened" ? "var(--c-stage)" : "var(--c-done)",
                              }}
                            >
                              {u.kind === "reopened" ? (
                                <RotateCcw size={14} />
                              ) : (
                                <CheckCircle2 size={15} />
                              )}
                            </span>
                          ) : (
                            <Avatar name={u.author_name} size={28} />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-[13.5px] font-semibold">
                              {u.author_name ?? "Someone"}
                            </span>
                            {system && (
                              <span className="text-[13px] text-ink-2">
                                {u.kind === "completed"
                                  ? ms
                                    ? "reached a milestone"
                                    : "marked a task done"
                                  : "reopened it"}
                              </span>
                            )}
                            <span
                              className="mono text-[11.5px] text-ink-3"
                              title={format(parseISO(u.created_at), "d MMM yyyy, HH:mm")}
                            >
                              {relativeTime(u.created_at)}
                            </span>
                          </div>

                          {(task || ms) && (
                            <div className="mt-1">
                              <span
                                className="inline-flex items-baseline gap-1.5 rounded px-1.5 py-0.5 text-[12px]"
                                style={{ background: "var(--c-reach-soft)", color: "var(--c-reach)" }}
                              >
                                {task?.wbs && <span className="mono">{task.wbs}</span>}
                                <span className="font-medium">{task?.title ?? ms?.title}</span>
                              </span>
                            </div>
                          )}

                          {u.body && (
                            <p className="text-[14.5px] mt-1.5 whitespace-pre-wrap" style={{ maxWidth: "none" }}>
                              {u.body}
                            </p>
                          )}

                          {myLinks.length > 0 && (
                            <ul className="list-none m-0 p-0 mt-2 space-y-1">
                              {myLinks.map((l) => (
                                <li key={l.id} className="flex items-center gap-1.5 min-w-0">
                                  <ExternalLink size={12} className="shrink-0 text-ink-3" />
                                  <a
                                    href={normalizeUrl(l.url)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[13px] truncate no-underline hover:underline"
                                    title={l.url}
                                  >
                                    {l.label || l.url}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        {u.author_id === me.id && (
                          <button
                            className="btn btn-danger !px-1.5 !py-1 shrink-0 h-fit opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                            aria-label="Delete this report"
                            onClick={() =>
                              void run(async () => {
                                await deleteUpdate(u.id);
                                await reload();
                                setToast("Report deleted");
                              })
                            }
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>

      {/* ------------------------------------------------------- side filter */}
      <aside className="space-y-4 min-w-0">
        {authors.length > 1 && (
          <section className="border border-line rounded-lg bg-surface">
            <div className="px-3.5 py-2.5 border-b border-line">
              <h2 className="text-[14px]">Filter by person</h2>
            </div>
            <ul className="list-none m-0 p-1.5">
              <li>
                <button
                  onClick={() => setFilter("")}
                  aria-pressed={filter === ""}
                  className="w-full text-left px-2 py-1.5 rounded text-[13px] hover:bg-raised transition"
                  style={{ background: filter === "" ? "var(--c-reach-soft)" : undefined, fontWeight: filter === "" ? 600 : 400 }}
                >
                  Everyone
                </button>
              </li>
              {authors.map(([id, name]) => (
                <li key={id}>
                  <button
                    onClick={() => setFilter(id)}
                    aria-pressed={filter === id}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-[13px] hover:bg-raised transition text-left"
                    style={{ background: filter === id ? "var(--c-reach-soft)" : undefined, fontWeight: filter === id ? 600 : 400 }}
                  >
                    <Avatar name={name} size={20} />
                    <span className="truncate">{name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="border border-line rounded-lg bg-surface p-3.5">
          <h2 className="text-[14px] mb-1.5">Who is here</h2>
          <ul className="list-none m-0 p-0 space-y-1.5">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-2 min-w-0">
                <Avatar name={m.display_name} email={m.invited_email} size={20} dimmed={!m.user_id} />
                <span className="text-[13px] truncate">{m.display_name}</span>
                {!m.user_id && (
                  <span className="text-[11px] text-ink-3 shrink-0" title="Invited but has not signed in">
                    invited
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      </aside>

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
