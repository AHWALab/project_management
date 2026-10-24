import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { initials, stageStyle, type Stage } from "../lib/status";
import { useDialog } from "../lib/hooks";

/* ----------------------------------------------------------------- avatar */

const AVATAR_TINTS = [
  "#2c6e7f",
  "#6b4f82",
  "#2f6b4a",
  "#8a5a2b",
  "#3a5f8a",
  "#7d3f52",
  "#4a6b2f",
  "#5a4a7d",
];

/** A stable colour per person, so faces stay recognisable across screens. */
function tintFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 9973;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

export function Avatar({
  name,
  email,
  size = 26,
  title,
  dimmed = false,
}: {
  name?: string | null;
  email?: string | null;
  size?: number;
  title?: string;
  dimmed?: boolean;
}) {
  const key = (name || email || "?").toLowerCase();
  return (
    <span
      title={title ?? name ?? email ?? undefined}
      aria-hidden={title ? undefined : true}
      className="inline-grid place-items-center shrink-0 rounded-full font-semibold select-none"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, size * 0.38),
        background: dimmed ? "var(--c-slack-soft)" : tintFor(key),
        color: dimmed ? "var(--c-ink-3)" : "#fff",
        border: dimmed ? "1px dashed var(--c-line-strong)" : "none",
        letterSpacing: "0.01em",
      }}
    >
      {initials(name, email)}
    </span>
  );
}

export function AvatarRow({
  people,
  max = 4,
  size = 24,
}: {
  people: { id: string; display_name: string; invited_email?: string | null; user_id?: string | null }[];
  max?: number;
  size?: number;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="flex items-center">
      {shown.map((p, i) => (
        <span key={p.id} style={{ marginLeft: i === 0 ? 0 : -size * 0.2 }} className="ring-2 ring-surface rounded-full">
          <Avatar
            name={p.display_name}
            email={p.invited_email}
            size={size}
            title={p.display_name + (p.user_id ? "" : " (invited, not signed in yet)")}
            dimmed={!p.user_id}
          />
        </span>
      ))}
      {rest > 0 && (
        <span
          className="grid place-items-center rounded-full bg-slack-soft text-ink-3 font-semibold ring-2 ring-surface"
          style={{ width: size, height: size, fontSize: size * 0.36, marginLeft: -size * 0.2 }}
          title={`${rest} more`}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}

/* -------------------------------------------------------------- progress */

/**
 * A quarter-circle gauge rather than a full ring. A full ring reads as a
 * loading spinner; this reads as a dial that has been turned part way.
 */
export function ProgressDial({
  value,
  size = 44,
  stage = "ontrack",
}: {
  value: number;
  size?: number;
  stage?: Stage;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const gap = c * 0.28; // open at the bottom, like a dial face
  const track = c - gap;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" role="img" aria-label={`${pct}% complete`}>
      <g transform={`rotate(129 ${size / 2} ${size / 2})`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--c-line)"
          strokeWidth={3.5}
          strokeDasharray={`${track} ${gap}`}
          strokeLinecap="round"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`var(--c-${stage === "done" ? "done" : stage === "overdue" ? "flood" : stage === "duesoon" ? "stage" : stage === "idle" ? "slack" : "reach"})`}
          strokeWidth={3.5}
          strokeDasharray={`${(track * pct) / 100} ${c}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 420ms cubic-bezier(.22,1,.36,1)" }}
        />
      </g>
      <text
        x="50%"
        y="53%"
        textAnchor="middle"
        dominantBaseline="middle"
        className="mono"
        style={{ fontSize: size * 0.27, fontWeight: 600, fill: "var(--c-ink)" }}
      >
        {pct}
      </text>
    </svg>
  );
}

/** A plain horizontal bar, for inline use in dense table rows. */
export function MiniBar({ value, stage = "ontrack" }: { value: number; stage?: Stage }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <span className="inline-block w-full h-1.5 rounded-full bg-line overflow-hidden align-middle">
      <span
        className={`block h-full rounded-full ${stageStyle[stage].dot}`}
        style={{ width: `${pct}%`, transition: "width 300ms cubic-bezier(.22,1,.36,1)" }}
      />
    </span>
  );
}

/* ------------------------------------------------------------------ pills */

export function StagePill({ stage, children }: { stage: Stage; children: ReactNode }) {
  const s = stageStyle[stage];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${s.bg} ${s.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {children}
    </span>
  );
}

export function Tag({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-slack-soft text-ink-2"
    >
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------- dialog */

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  width = 520,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  width?: number;
}) {
  const ref = useDialog(open, onClose);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{ background: "color-mix(in srgb, var(--c-ink) 42%, transparent)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full bg-surface border border-line rounded-lg mt-6 sm:mt-14"
        style={{ maxWidth: width, boxShadow: "var(--shadow-pop)" }}
      >
        <div className="flex items-start gap-4 px-5 pt-4 pb-3 border-b border-line">
          <div className="flex-1 min-w-0">
            <h2>{title}</h2>
            {description && <p className="text-sm text-ink-2 mt-0.5">{description}</p>}
          </div>
          <button data-close onClick={onClose} className="btn !px-1.5 !py-1.5 shrink-0" aria-label="Close">
            <X size={15} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- states */

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="border border-dashed border-line-strong rounded-lg px-6 py-10 text-center">
      <h3 className="text-ink">{title}</h3>
      <p className="text-sm text-ink-2 mt-1.5 mx-auto">{body}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="border border-flood rounded-md bg-flood-soft text-flood px-3 py-2 text-sm">
      {message}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-ink-3 py-10 justify-center">
      <span
        className="w-3.5 h-3.5 rounded-full border-2 border-line"
        style={{ borderTopColor: "var(--c-reach)", animation: "spin 700ms linear infinite" }}
      />
      {label}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ toast */

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  return (
    <div
      role="status"
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-ink text-paper px-4 py-2.5 rounded-md text-sm font-medium"
      style={{ boxShadow: "var(--shadow-pop)" }}
    >
      {message}
    </div>
  );
}

/* ---------------------------------------------------- inline editable text */

/**
 * Text that becomes an input when clicked and saves when it loses focus.
 * Used for every editable value so the project screens never turn into forms.
 */
export function EditableText({
  value,
  onSave,
  placeholder = "Add text",
  multiline = false,
  className = "",
  mono = false,
  ariaLabel,
}: {
  value: string | null;
  onSave: (next: string | null) => void;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
  mono?: boolean;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current) setDraft(value ?? "");
  }, [value]);

  const commit = () => {
    dirty.current = false;
    const next = draft.trim();
    if (next === (value ?? "").trim()) return;
    onSave(next === "" ? null : next);
  };

  const shared = {
    value: draft,
    "aria-label": ariaLabel,
    placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      dirty.current = true;
      setDraft(e.target.value);
    },
    onBlur: commit,
    className: `qf ${mono ? "mono" : ""} ${className}`,
  };

  if (multiline) {
    return (
      <textarea
        {...shared}
        rows={Math.max(2, Math.min(10, draft.split("\n").length + 1))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) (e.target as HTMLTextAreaElement).blur();
        }}
      />
    );
  }
  return (
    <input
      {...shared}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          dirty.current = false;
          setDraft(value ?? "");
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

export function DateCell({
  value,
  onSave,
  ariaLabel,
}: {
  value: string | null;
  onSave: (next: string | null) => void;
  ariaLabel: string;
}) {
  return (
    <input
      type="date"
      aria-label={ariaLabel}
      value={value ?? ""}
      onChange={(e) => onSave(e.target.value || null)}
      className="qf mono text-[13px]"
      style={{ colorScheme: "light dark" }}
    />
  );
}
