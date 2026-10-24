import { useState } from "react";
import { Mail, Plus, Shield, Trash2 } from "lucide-react";
import type { TabProps } from "../pages/Project";
import { Avatar, Dialog, EditableText, ErrorNote, Toast } from "../components/bits";
import { addMember, removeMember, updateMember } from "../lib/db";
import { useAction } from "../lib/hooks";
import { loadByMember } from "../lib/raci";
import type { Member } from "../lib/types";

export default function Team({ bundle, reload, me }: TabProps) {
  const { project, members, raci, tasks, milestones, risks } = bundle;
  const { run, error } = useAction();
  const [toast, setToast] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);

  const myseat = members.find((m) => m.user_id === me.id);
  const canManage = Boolean(myseat?.is_admin);
  const load = loadByMember(raci);
  const admins = members.filter((m) => m.is_admin).length;

  const act = (fn: () => Promise<unknown>, msg?: string) =>
    void run(async () => {
      await fn();
      await reload();
      if (msg) setToast(msg);
    });

  /** What a person would leave behind if they were removed. */
  function assignedTo(member: Member) {
    const own = tasks.filter((t) => t.owner_id === member.id && t.status !== "done").length;
    const ms = milestones.filter((m) => m.owner_id === member.id && !m.completion_date).length;
    const rk = risks.filter((r) => r.owner_id === member.id && r.status === "open").length;
    const letters = load.get(member.id);
    const raciCount = letters ? letters.R + letters.A : 0;
    return { own, ms, rk, raciCount };
  }

  return (
    <div className="space-y-4" style={{ maxWidth: 760 }}>
      {error && <ErrorNote message={error} />}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h2>
            {members.length} {members.length === 1 ? "person" : "people"}
          </h2>
          <p className="text-[13px] text-ink-3 mt-0.5">
            Adding someone by email lets them sign in and see this project. Their account links up
            the first time they use the link we email them.
          </p>
        </div>
        {canManage && (
          <button className="btn btn-primary shrink-0" onClick={() => setAdding(true)}>
            <Plus size={15} />
            Add someone
          </button>
        )}
      </div>

      {!canManage && (
        <p
          className="text-[13px] rounded-md px-3 py-2"
          style={{ background: "var(--c-stage-soft)", color: "var(--c-stage)" }}
        >
          Only a project admin can change the team. You can edit your own name and role.
        </p>
      )}

      <ul className="list-none m-0 p-0 border border-line rounded-lg bg-surface divide-y divide-line">
        {members.map((m) => {
          const mine = m.user_id === me.id;
          const editable = canManage || mine;
          const a = assignedTo(m);
          return (
            <li key={m.id} className="p-3.5 group">
              <div className="flex items-start gap-3">
                <Avatar
                  name={m.display_name}
                  email={m.invited_email}
                  size={34}
                  title={m.display_name}
                  dimmed={!m.user_id}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {editable ? (
                      <div style={{ maxWidth: 240 }}>
                        <EditableText
                          value={m.display_name}
                          ariaLabel="Name"
                          onSave={(v) => v && act(() => updateMember(m.id, { display_name: v }))}
                          className="!text-[14.5px] font-semibold"
                        />
                      </div>
                    ) : (
                      <span className="text-[14.5px] font-semibold">{m.display_name}</span>
                    )}
                    {mine && (
                      <span className="text-[11.5px] text-ink-3" title="This is you">
                        you
                      </span>
                    )}
                    {m.is_admin && (
                      <span
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold"
                        style={{ background: "var(--c-reach-soft)", color: "var(--c-reach)" }}
                        title="Can add and remove people, and delete the project"
                      >
                        <Shield size={10} />
                        admin
                      </span>
                    )}
                    {!m.user_id && (
                      <span
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]"
                        style={{ background: "var(--c-slack-soft)", color: "var(--c-ink-3)" }}
                        title="Has not signed in yet"
                      >
                        <Mail size={10} />
                        not signed in yet
                      </span>
                    )}
                  </div>

                  <div className="mt-1" style={{ maxWidth: 300 }}>
                    {editable ? (
                      <EditableText
                        value={m.role}
                        ariaLabel="Role"
                        placeholder="Role, for example Developer"
                        onSave={(v) => act(() => updateMember(m.id, { role: v }))}
                        className="!text-[13px] text-ink-2"
                      />
                    ) : (
                      <span className="text-[13px] text-ink-2">{m.role}</span>
                    )}
                  </div>

                  {m.invited_email && (
                    <div className="mono text-[12px] text-ink-3 mt-0.5 truncate">
                      {m.invited_email}
                    </div>
                  )}

                  <div className="flex items-center gap-3 mt-2 text-[12px] text-ink-3 flex-wrap">
                    <span title="Tasks where this person is responsible or accountable">
                      {a.raciCount} in the matrix
                    </span>
                    <span title="Unfinished tasks they own">{a.own} tasks open</span>
                    {a.ms > 0 && <span>{a.ms} milestones</span>}
                    {a.rk > 0 && <span>{a.rk} risks</span>}
                  </div>
                </div>

                {canManage && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      className="btn !px-2 !py-1 !text-[12.5px]"
                      onClick={() =>
                        act(
                          () => updateMember(m.id, { is_admin: !m.is_admin }),
                          m.is_admin ? "Admin removed" : "Made an admin"
                        )
                      }
                      disabled={m.is_admin && admins === 1}
                      title={
                        m.is_admin && admins === 1
                          ? "A project needs at least one admin"
                          : m.is_admin
                            ? "Remove admin rights"
                            : "Make an admin"
                      }
                    >
                      {m.is_admin ? "Remove admin" : "Make admin"}
                    </button>
                    <button
                      className="btn btn-danger !px-1.5 !py-1 opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                      onClick={() => setRemoving(m)}
                      disabled={m.is_admin && admins === 1}
                      aria-label={`Remove ${m.display_name}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <AddMember
        open={adding}
        projectId={project.id}
        onClose={() => setAdding(false)}
        onAdded={async () => {
          setAdding(false);
          await reload();
          setToast("Added to the project");
        }}
      />

      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={removing ? `Remove ${removing.display_name}?` : ""}
        width={460}
      >
        {removing && (
          <div className="space-y-3.5">
            <p className="text-sm text-ink-2">
              They lose access to this project. Anything they own here is left without an owner, and
              their progress reports stay in the activity feed.
            </p>
            {(() => {
              const a = assignedTo(removing);
              const bits: string[] = [];
              if (a.own) bits.push(`${a.own} open ${a.own === 1 ? "task" : "tasks"}`);
              if (a.raciCount) bits.push(`${a.raciCount} matrix ${a.raciCount === 1 ? "assignment" : "assignments"}`);
              if (a.ms) bits.push(`${a.ms} ${a.ms === 1 ? "milestone" : "milestones"}`);
              if (a.rk) bits.push(`${a.rk} open ${a.rk === 1 ? "risk" : "risks"}`);
              if (bits.length === 0) return null;
              return (
                <p
                  className="text-[13px] rounded-md px-3 py-2"
                  style={{ background: "var(--c-stage-soft)", color: "var(--c-stage)" }}
                >
                  They currently hold {bits.join(", ")}. Reassign those first if you need them
                  covered.
                </p>
              );
            })()}
            <div className="flex justify-end gap-2">
              <button className="btn" onClick={() => setRemoving(null)}>
                Keep them
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  const id = removing.id;
                  setRemoving(null);
                  act(() => removeMember(id), "Removed from the project");
                }}
              >
                Remove
              </button>
            </div>
          </div>
        )}
      </Dialog>

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

function AddMember({
  open,
  projectId,
  onClose,
  onAdded,
}: {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onAdded: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const { run, pending, error } = useAction();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const ok = await run(() =>
      addMember({
        project_id: projectId,
        display_name: name.trim(),
        invited_email: email.trim() || null,
        role: role.trim() || null,
      })
    );
    if (ok) {
      setName("");
      setEmail("");
      setRole("");
      await onAdded();
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add someone to this project"
      description="An email address is what lets them sign in. Leave it out to put a name in the matrix without giving access."
      width={480}
    >
      <form onSubmit={submit} className="space-y-3.5">
        <div>
          <label htmlFor="am-name" className="block text-sm font-semibold mb-1">
            Name
          </label>
          <input
            id="am-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Humberto Vergara"
            className="field"
          />
        </div>
        <div>
          <label htmlFor="am-email" className="block text-sm font-semibold mb-1">
            Email <span className="font-normal text-ink-3">optional</span>
          </label>
          <input
            id="am-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@uiowa.edu"
            className="field mono"
          />
          <p className="text-[12.5px] text-ink-3 mt-1.5">
            They sign in at this site with that address and get a link by email. Nothing is sent
            now, so tell them it is waiting.
          </p>
        </div>
        <div>
          <label htmlFor="am-role" className="block text-sm font-semibold mb-1">
            Role <span className="font-normal text-ink-3">optional</span>
          </label>
          <input
            id="am-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Project lead"
            className="field"
          />
        </div>

        {error && <ErrorNote message={error} />}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={pending || !name.trim()}>
            {pending ? "Adding" : "Add to project"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
