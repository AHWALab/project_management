import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Shell from "../components/Shell";
import { ErrorNote, Spinner, StagePill } from "../components/bits";
import { useProject, type Me } from "../lib/hooks";
import { countProblems } from "../lib/raci";
import { riskScore, taskStage, milestoneStage } from "../lib/status";
import type { ProjectBundle } from "../lib/types";

import Overview from "../tabs/Overview";
import Timeline from "../tabs/Timeline";
import RaciTab from "../tabs/RaciTab";
import Milestones from "../tabs/Milestones";
import Risks from "../tabs/Risks";
import Activity from "../tabs/Activity";
import Team from "../tabs/Team";

export interface TabProps {
  bundle: ProjectBundle;
  reload: () => Promise<void>;
  me: Me;
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "timeline", label: "Timeline" },
  { id: "raci", label: "RACI" },
  { id: "milestones", label: "Milestones" },
  { id: "risks", label: "Risks" },
  { id: "activity", label: "Activity" },
  { id: "team", label: "Team" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function ProjectPage({ me }: { me: Me }) {
  const { id } = useParams<{ id: string }>();
  const { bundle, error, reload, loading } = useProject(id);
  const [params, setParams] = useSearchParams();

  const current = (params.get("tab") as TabId | null) ?? "overview";
  const active: TabId = TABS.some((t) => t.id === current) ? current : "overview";

  /** Counts shown on the tab bar, so nothing needing attention stays hidden. */
  const badges = useMemo(() => {
    if (!bundle) return null;
    const real = bundle.tasks.filter((t) => !t.is_summary);
    return {
      timeline: real.filter((t) => taskStage(t).stage === "overdue").length,
      raci: countProblems(bundle.tasks, bundle.raci),
      milestones: bundle.milestones.filter((m) => milestoneStage(m).stage === "overdue").length,
      risks: bundle.risks.filter((r) => r.status === "open" && (riskScore(r) ?? 0) >= 15).length,
    };
  }, [bundle]);

  const stage = useMemo(() => {
    if (!bundle) return null;
    const real = bundle.tasks.filter((t) => !t.is_summary);
    const late = real.filter((t) => taskStage(t).stage === "overdue").length;
    if (late > 0) {
      return { stage: "overdue" as const, label: late === 1 ? "1 task late" : `${late} tasks late` };
    }
    const soon = real.filter((t) => taskStage(t).stage === "duesoon").length;
    if (soon > 0) {
      return { stage: "duesoon" as const, label: soon === 1 ? "1 due this week" : `${soon} due this week` };
    }
    if (real.length > 0 && real.every((t) => t.status === "done")) {
      return { stage: "done" as const, label: "All tasks done" };
    }
    if (real.length === 0) return { stage: "idle" as const, label: "No tasks yet" };
    return { stage: "ontrack" as const, label: "On track" };
  }, [bundle]);

  return (
    <Shell
      me={me}
      breadcrumb={
        bundle ? (
          <div className="min-w-0 flex items-center gap-2">
            <span className="font-semibold truncate">{bundle.project.name}</span>
            {bundle.project.code && (
              <span className="mono text-[12px] text-ink-3 shrink-0 hidden sm:inline">
                {bundle.project.code}
              </span>
            )}
          </div>
        ) : undefined
      }
    >
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 no-underline hover:underline mb-3"
      >
        <ArrowLeft size={14} />
        All projects
      </Link>

      {loading && <Spinner label="Loading project" />}
      {error && <ErrorNote message={error} />}

      {bundle && (
        <>
          <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
            <div className="min-w-0">
              <h1 className="truncate">{bundle.project.name}</h1>
              {bundle.project.summary && (
                <p className="text-ink-2 mt-1 text-[15px]">{bundle.project.summary}</p>
              )}
            </div>
            {stage && <StagePill stage={stage.stage}>{stage.label}</StagePill>}
          </div>

          <nav
            className="flex gap-0.5 border-b border-line mb-5 overflow-x-auto thin-scroll"
            aria-label="Project sections"
          >
            {TABS.map((t) => {
              const count = badges ? (badges as Record<string, number | undefined>)[t.id] : undefined;
              const on = active === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.set("tab", t.id);
                    setParams(next, { replace: true });
                  }}
                  aria-current={on ? "page" : undefined}
                  className="relative shrink-0 px-3 py-2 text-sm font-semibold whitespace-nowrap transition"
                  style={{
                    color: on ? "var(--c-ink)" : "var(--c-ink-3)",
                    boxShadow: on ? "inset 0 -2px 0 0 var(--c-reach)" : undefined,
                  }}
                >
                  {t.label}
                  {count !== undefined && count > 0 && (
                    <span
                      className="mono ml-1.5 inline-grid place-items-center rounded-full px-1.5 font-bold"
                      style={{
                        fontSize: 10.5,
                        minWidth: 17,
                        height: 17,
                        background: "var(--c-flood)",
                        color: "#fff",
                      }}
                      title={`${count} need attention`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {active === "overview" && <Overview bundle={bundle} reload={reload} me={me} />}
          {active === "timeline" && <Timeline bundle={bundle} reload={reload} me={me} />}
          {active === "raci" && <RaciTab bundle={bundle} reload={reload} me={me} />}
          {active === "milestones" && <Milestones bundle={bundle} reload={reload} me={me} />}
          {active === "risks" && <Risks bundle={bundle} reload={reload} me={me} />}
          {active === "activity" && <Activity bundle={bundle} reload={reload} me={me} />}
          {active === "team" && <Team bundle={bundle} reload={reload} me={me} />}
        </>
      )}
    </Shell>
  );
}
