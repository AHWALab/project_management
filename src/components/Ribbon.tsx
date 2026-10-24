import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { addDays, format, isSameDay, isWeekend } from "date-fns";
import gsap from "gsap";
import { toDate, isoDay, type Stage } from "../lib/status";
import { usePrefersReducedMotion } from "../lib/hooks";

export interface DueItem {
  id: string;
  project_id: string;
  project_name: string;
  title: string;
  due: string;
  stage: Stage;
  kind: "task" | "milestone";
}

const WINDOW_DAYS = 14;
const MAX_PER_DAY = 2;
/** Two chips plus the overflow line, so the axis and the late panel match. */
const BODY_H = 74;

/**
 * Everything falling due across every project, on one axis, with what has
 * already slipped parked at the left. This is the question the lab lead opens
 * the app to answer, so it comes before the project list rather than after it.
 */
export default function Ribbon({ items }: { items: DueItem[] }) {
  const navigate = useNavigate();
  const root = useRef<HTMLDivElement | null>(null);
  const reduced = usePrefersReducedMotion();

  const today = useMemo(() => new Date(), []);

  const days = useMemo(
    () => Array.from({ length: WINDOW_DAYS + 1 }, (_, i) => addDays(today, i)),
    [today]
  );

  const { late, byDay, beyond } = useMemo(() => {
    const late: DueItem[] = [];
    const byDay = new Map<string, DueItem[]>();
    let beyond = 0;
    const horizon = addDays(today, WINDOW_DAYS);

    for (const item of items) {
      const d = toDate(item.due);
      if (!d) continue;
      if (item.stage === "overdue") {
        late.push(item);
        continue;
      }
      if (d > horizon) {
        beyond += 1;
        continue;
      }
      const key = isoDay(d);
      const list = byDay.get(key);
      if (list) list.push(item);
      else byDay.set(key, [item]);
    }
    late.sort((a, b) => a.due.localeCompare(b.due));
    return { late, byDay, beyond };
  }, [items, today]);

  const upcoming = items.length - late.length - beyond;

  useEffect(() => {
    if (reduced || !root.current) return;
    const el = root.current;
    const rule = el.querySelector("[data-rule]");
    const chips = el.querySelectorAll("[data-chip]");
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
      if (rule) tl.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.5, transformOrigin: "left center" });
      if (chips.length) {
        tl.fromTo(
          chips,
          { opacity: 0, y: 6 },
          { opacity: 1, y: 0, duration: 0.3, stagger: { each: 0.016, from: "start" } },
          0.18
        );
      }
    }, el);
    return () => ctx.revert();
    // Re-runs when the set of items changes, which is the moment worth animating.
  }, [reduced, items]);

  if (items.length === 0) {
    return (
      <section className="border border-line rounded-lg bg-surface px-4 py-5">
        <p className="text-sm text-ink-2">
          Nothing is due in the next two weeks. Add dates to tasks and they will show up here.
        </p>
      </section>
    );
  }

  return (
    <section ref={root} aria-label="Due dates over the next two weeks">
      <div className="flex items-baseline justify-between gap-4 mb-2.5">
        <h2 className="text-[15px] font-semibold">Next two weeks</h2>
        <p className="text-[13px] text-ink-3">
          {late.length > 0 && (
            <>
              <span className="text-flood font-semibold">{late.length} late</span>
              {upcoming > 0 || beyond > 0 ? ", " : ""}
            </>
          )}
          {upcoming > 0 && <>{upcoming} coming up</>}
          {beyond > 0 && <>, {beyond} further out</>}
        </p>
      </div>

      <div className="border border-line rounded-lg bg-surface overflow-hidden">
        <div className="flex flex-col sm:flex-row items-stretch">
          {/* What has already slipped. Kept separate because it has no place on
              a forward looking axis, and burying it would be the whole problem. */}
          {late.length > 0 && (
            <div
              className="shrink-0 border-b sm:border-b-0 sm:border-r border-line-strong px-2.5 py-2"
              style={{ background: "var(--c-flood-soft)" }}
            >
              <div className="flex items-baseline gap-2 mb-1.5" style={{ minWidth: 150 }}>
                <span className="text-[11.5px] font-bold text-flood">Late</span>
                <span className="mono text-[11px] text-flood">{late.length}</span>
              </div>
              <div className="space-y-1" style={{ minHeight: BODY_H }}>
                {late.slice(0, MAX_PER_DAY).map((item) => (
                  <Chip key={item.id} item={item} onOpen={() => navigate(`/project/${item.project_id}`)} />
                ))}
                {late.length > MAX_PER_DAY && (
                  <div className="mono text-[11px] text-flood pl-0.5">
                    and {late.length - MAX_PER_DAY} more
                  </div>
                )}
              </div>
            </div>
          )}

          {/* The forward axis. One column per day. */}
          <div className="flex-1 min-w-0 overflow-x-auto thin-scroll">
            <div className="flex" style={{ minWidth: 15 * 64 }}>
              {days.map((d) => {
                const key = isoDay(d);
                const list = byDay.get(key) ?? [];
                const weekend = isWeekend(d);
                const isToday = isSameDay(d, today);
                const monday = d.getDay() === 1;
                return (
                  <div
                    key={key}
                    className="flex-1 min-w-0 px-1.5 pt-2"
                    style={{
                      background: weekend ? "var(--c-raised)" : undefined,
                      borderLeft: isToday
                        ? "2px solid var(--c-reach)"
                        : monday
                          ? "1px solid var(--c-line)"
                          : "1px solid transparent",
                    }}
                  >
                    <div className="mb-1.5 leading-tight">
                      <div
                        className={`mono text-[11px] ${isToday ? "text-reach font-bold" : "text-ink-3"}`}
                      >
                        {format(d, "EEE")}
                      </div>
                      <div
                        className={`mono text-[13px] ${isToday ? "text-reach font-bold" : "text-ink-2 font-medium"}`}
                      >
                        {format(d, "d")}
                        {format(d, "d") === "1" || isToday ? (
                          <span className="ml-1 text-[10.5px] font-medium">{format(d, "MMM")}</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="space-y-1 pb-2" style={{ minHeight: BODY_H }}>
                      {list.slice(0, MAX_PER_DAY).map((item) => (
                        <Chip
                          key={item.id}
                          item={item}
                          compact
                          onOpen={() => navigate(`/project/${item.project_id}`)}
                        />
                      ))}
                      {list.length > MAX_PER_DAY && (
                        <div className="mono text-[10.5px] text-ink-3 pl-0.5">
                          +{list.length - MAX_PER_DAY}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div
              data-rule
              className="h-px"
              style={{ background: "var(--c-line-strong)" }}
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function Chip({
  item,
  onOpen,
  compact = false,
}: {
  item: DueItem;
  onOpen: () => void;
  compact?: boolean;
}) {
  const colour =
    item.stage === "overdue"
      ? "var(--c-flood)"
      : item.stage === "duesoon"
        ? "var(--c-stage)"
        : "var(--c-reach)";
  return (
    <button
      data-chip
      onClick={onOpen}
      title={`${item.project_name}: ${item.title} (${item.kind === "milestone" ? "milestone" : "task"}, due ${item.due})`}
      className="block w-full text-left rounded-sm px-1.5 py-1 hover:brightness-95 transition"
      style={{
        background: "color-mix(in srgb, var(--c-surface) 86%, " + colour + ")",
        borderLeft: `2.5px solid ${colour}`,
        cursor: "pointer",
      }}
    >
      <span
        className="block truncate font-semibold text-ink"
        style={{ fontSize: compact ? 10.5 : 11.5, lineHeight: 1.3 }}
      >
        {item.kind === "milestone" ? "◆ " : ""}
        {item.title}
      </span>
      <span className="block truncate text-ink-3" style={{ fontSize: 10, lineHeight: 1.3 }}>
        {item.project_name}
      </span>
    </button>
  );
}
