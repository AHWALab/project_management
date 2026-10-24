import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { TabProps } from "../pages/Project";
import { EditableText, EmptyState, ErrorNote, Toast } from "../components/bits";
import { addRisk, deleteRisk, updateRisk } from "../lib/db";
import { useAction } from "../lib/hooks";
import { riskBand, riskScore, stageVar } from "../lib/status";
import type { Risk } from "../lib/types";

const SCALE = [1, 2, 3, 4, 5];

const LIKELIHOOD_WORDS = ["", "Rare", "Unlikely", "Possible", "Likely", "Almost certain"];
const SEVERITY_WORDS = ["", "Negligible", "Minor", "Moderate", "Major", "Severe"];

export default function Risks({ bundle, reload }: TabProps) {
  const { project, risks, members } = bundle;
  const { run, error } = useAction();
  const [toast, setToast] = useState<string | null>(null);
  const [newDesc, setNewDesc] = useState("");
  const [showClosed, setShowClosed] = useState(false);

  const ordered = useMemo(() => {
    const list = showClosed ? risks : risks.filter((r) => r.status !== "closed");
    // Worst first: that is the order anyone reading a risk register wants.
    return [...list].sort((a, b) => (riskScore(b) ?? -1) - (riskScore(a) ?? -1));
  }, [risks, showClosed]);

  const open = risks.filter((r) => r.status === "open");

  /** Counts per cell of the 5 by 5 grid, open risks only. */
  const heat = useMemo(() => {
    const grid = new Map<string, Risk[]>();
    for (const r of open) {
      if (r.likelihood == null || r.severity == null) continue;
      const key = `${r.likelihood}-${r.severity}`;
      const list = grid.get(key);
      if (list) list.push(r);
      else grid.set(key, [r]);
    }
    return grid;
  }, [open]);

  const unscored = open.filter((r) => r.likelihood == null || r.severity == null).length;

  const act = (fn: () => Promise<unknown>, msg?: string) =>
    void run(async () => {
      await fn();
      await reload();
      if (msg) setToast(msg);
    });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const description = newDesc.trim();
    if (!description) return;
    await run(async () => {
      await addRisk({
        project_id: project.id,
        description,
        risk_no: `${risks.length + 1}.0`,
        likelihood: 3,
        severity: 3,
        sort_order: Math.max(0, ...risks.map((r) => r.sort_order)) + 1000,
      });
      await reload();
      setNewDesc("");
    });
  }

  if (risks.length === 0) {
    return (
      <>
        <EmptyState
          title="No risks logged"
          body="A risk is something that has not gone wrong yet. Writing it down with a likelihood and a consequence is what turns it into something you can plan around."
          action={
            <form onSubmit={create} className="flex gap-2 w-full" style={{ maxWidth: 460 }}>
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Gauge record for the 2026 event may not be published in time"
                aria-label="Risk description"
                className="field"
              />
              <button className="btn btn-primary shrink-0" disabled={!newDesc.trim()}>
                Add
              </button>
            </form>
          }
        />
        <Toast message={toast} onDone={() => setToast(null)} />
      </>
    );
  }

  return (
    <div className="space-y-5">
      {error && <ErrorNote message={error} />}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] items-start">
        <div className="min-w-0">
          <h2 className="mb-1">
            {open.length} open {open.length === 1 ? "risk" : "risks"}
          </h2>
          <p className="text-[13px] text-ink-3">
            Score each one for how likely it is and how bad it would be. Likelihood times
            consequence gives the score, and anything at 15 or above counts as high.
            {unscored > 0 && ` ${unscored} not yet scored.`}
          </p>
        </div>

        {/* The 5 by 5 grid, which makes the shape of the register readable at a
            glance in a way a sorted table never is. */}
        <div className="shrink-0">
          <table className="border-collapse" style={{ fontSize: 11 }}>
            <caption className="text-[11.5px] text-ink-3 text-left pb-1.5">
              Open risks by likelihood and consequence
            </caption>
            <tbody>
              {[...SCALE].reverse().map((lik) => (
                <tr key={lik}>
                  <th
                    scope="row"
                    className="mono pr-1.5 text-right font-medium text-ink-3"
                    title={LIKELIHOOD_WORDS[lik]}
                    style={{ fontSize: 10.5 }}
                  >
                    {lik}
                  </th>
                  {SCALE.map((sev) => {
                    const cell = heat.get(`${lik}-${sev}`) ?? [];
                    const band = riskBand(lik * sev);
                    return (
                      <td key={sev} className="p-0">
                        <div
                          title={
                            cell.length
                              ? `${LIKELIHOOD_WORDS[lik]} and ${SEVERITY_WORDS[sev].toLowerCase()}, score ${lik * sev}: ${cell.map((r) => r.description).join("; ")}`
                              : `${LIKELIHOOD_WORDS[lik]} and ${SEVERITY_WORDS[sev].toLowerCase()}, score ${lik * sev}`
                          }
                          className="mono grid place-items-center font-bold"
                          style={{
                            width: 30,
                            height: 26,
                            border: "1px solid var(--c-surface)",
                            background: cell.length
                              ? stageVar[band.stage]
                              : `color-mix(in srgb, ${stageVar[band.stage]} 11%, var(--c-surface))`,
                            color: cell.length ? "#fff" : "transparent",
                          }}
                        >
                          {cell.length || ""}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <th />
                {SCALE.map((sev) => (
                  <th
                    key={sev}
                    scope="col"
                    className="mono pt-1 font-medium text-ink-3"
                    title={SEVERITY_WORDS[sev]}
                    style={{ fontSize: 10.5 }}
                  >
                    {sev}
                  </th>
                ))}
              </tr>
            </tbody>
          </table>
          <p className="text-[10.5px] text-ink-3 mt-1" style={{ maxWidth: 190 }}>
            Up the side, how likely. Along the bottom, how bad.
          </p>
        </div>
      </div>

      <ul className="list-none m-0 p-0 space-y-2.5">
        {ordered.map((r) => {
          const score = riskScore(r);
          const band = riskBand(score);
          return (
            <li
              key={r.id}
              className="border border-line rounded-lg bg-surface overflow-hidden group"
              style={{ opacity: r.status === "closed" ? 0.62 : 1 }}
            >
              <div className="flex">
                <span
                  aria-hidden="true"
                  className="shrink-0"
                  style={{ width: 4, background: stageVar[band.stage] }}
                />
                <div className="flex-1 min-w-0 p-3">
                  <div className="flex items-start gap-3">
                    <span className="mono text-[11.5px] text-ink-3 mt-0.5 shrink-0" style={{ width: 28 }}>
                      {r.risk_no}
                    </span>
                    <div className="min-w-0 flex-1">
                      <EditableText
                        value={r.description}
                        ariaLabel="Risk description"
                        multiline
                        onSave={(v) => v && act(() => updateRisk(r.id, { description: v }))}
                        className="!text-[14.5px] font-semibold"
                      />
                    </div>
                    <span
                      className="mono shrink-0 rounded px-1.5 py-0.5 font-bold"
                      style={{
                        fontSize: 11,
                        background: `color-mix(in srgb, ${stageVar[band.stage]} 16%, var(--c-surface))`,
                        color: stageVar[band.stage],
                      }}
                      title={
                        score == null
                          ? "Not scored yet"
                          : `Likelihood ${r.likelihood} times consequence ${r.severity}`
                      }
                    >
                      {score == null ? band.label : `${band.label} ${score}`}
                    </span>
                    <button
                      className="btn btn-danger !px-1.5 !py-1 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                      aria-label="Delete risk"
                      onClick={() => act(() => deleteRisk(r.id), "Risk deleted")}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  <div
                    className="grid gap-x-4 gap-y-2.5 mt-3 pl-10"
                    style={{ gridTemplateColumns: "repeat(auto-fit, minmax(168px, 1fr))" }}
                  >
                    <Scale
                      label="How likely"
                      words={LIKELIHOOD_WORDS}
                      value={r.likelihood}
                      onPick={(v) => act(() => updateRisk(r.id, { likelihood: v }))}
                    />
                    <Scale
                      label="How bad"
                      words={SEVERITY_WORDS}
                      value={r.severity}
                      onPick={(v) => act(() => updateRisk(r.id, { severity: v }))}
                    />
                    <label className="block min-w-0">
                      <span className="block text-[12px] text-ink-3 mb-0.5">Owner</span>
                      <select
                        aria-label="Risk owner"
                        value={r.owner_id ?? ""}
                        onChange={(e) => act(() => updateRisk(r.id, { owner_id: e.target.value || null }))}
                        className="qf !text-[13px]"
                      >
                        <option value="">Nobody yet</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.display_name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block min-w-0">
                      <span className="block text-[12px] text-ink-3 mb-0.5">State</span>
                      <select
                        aria-label="Risk state"
                        value={r.status}
                        onChange={(e) =>
                          act(() => updateRisk(r.id, { status: e.target.value as Risk["status"] }))
                        }
                        className="qf !text-[13px]"
                      >
                        <option value="open">Open</option>
                        <option value="mitigated">Mitigated</option>
                        <option value="closed">Closed</option>
                      </select>
                    </label>
                  </div>

                  <div className="mt-3 pl-10 space-y-2.5">
                    <Field label="If it happens">
                      <EditableText
                        value={r.consequence}
                        ariaLabel="Consequence"
                        multiline
                        placeholder="What it would do to the schedule or the result"
                        onSave={(v) => act(() => updateRisk(r.id, { consequence: v }))}
                        className="text-[13.5px]"
                      />
                    </Field>
                    <Field label="What we will do about it">
                      <EditableText
                        value={r.mitigation}
                        ariaLabel="Mitigation"
                        multiline
                        placeholder="The plan to make it less likely or less damaging"
                        onSave={(v) => act(() => updateRisk(r.id, { mitigation: v }))}
                        className="text-[13.5px]"
                      />
                    </Field>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <form onSubmit={create} className="flex gap-2 flex-1" style={{ maxWidth: 480 }}>
          <input
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Add another risk"
            aria-label="New risk description"
            className="field"
          />
          <button className="btn shrink-0" disabled={!newDesc.trim()}>
            <Plus size={15} />
            Add
          </button>
        </form>
        {risks.some((r) => r.status === "closed") && (
          <label className="flex items-center gap-2 text-[13px] text-ink-2 shrink-0">
            <input
              type="checkbox"
              checked={showClosed}
              onChange={(e) => setShowClosed(e.target.checked)}
              style={{ accentColor: "var(--c-reach)" }}
            />
            Show closed
          </label>
        )}
      </div>

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

function Scale({
  label,
  words,
  value,
  onPick,
}: {
  label: string;
  words: string[];
  value: number | null;
  onPick: (v: number) => void;
}) {
  return (
    <div className="min-w-0">
      <span className="block text-[12px] text-ink-3 mb-1">
        {label}
        {value ? <span className="text-ink-2">, {words[value].toLowerCase()}</span> : ""}
      </span>
      <div className="flex gap-1" role="group" aria-label={label}>
        {SCALE.map((n) => (
          <button
            key={n}
            onClick={() => onPick(n)}
            aria-pressed={value === n}
            title={words[n]}
            className="mono grid place-items-center rounded transition"
            style={{
              width: 26,
              height: 24,
              fontSize: 11.5,
              fontWeight: 600,
              border: `1px solid ${value === n ? "var(--c-reach)" : "var(--c-line)"}`,
              background: value === n ? "var(--c-reach)" : "transparent",
              color: value === n ? "#fff" : "var(--c-ink-3)",
            }}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="block text-[12px] text-ink-3 mb-0.5">{label}</span>
      {children}
    </div>
  );
}
