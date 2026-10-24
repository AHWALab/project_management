import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isConfigured } from "./supabase";
import { fetchBundle, fetchProjects } from "./db";
import type { ProjectBundle, ProjectRollup } from "./types";

/* ------------------------------------------------------------------- auth */

export interface Me {
  id: string;
  email: string;
  name: string;
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!alive) return;
      setSession(next);
      setLoading(false);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const me: Me | null = session?.user
    ? {
        id: session.user.id,
        email: session.user.email ?? "",
        name:
          (session.user.user_metadata?.full_name as string | undefined) ||
          (session.user.email ?? "").split("@")[0],
      }
    : null;

  return { session, me, loading };
}

/* ------------------------------------------------------------ project list */

export function useProjects() {
  const [rows, setRows] = useState<ProjectRollup[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      setRows(await fetchProjects());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { rows, error, reload, loading: rows === null && error === null };
}

/* ---------------------------------------------------------- one project */

/**
 * Loads a project and keeps it fresh. Changes other people make arrive over
 * the realtime channel, which matters because a lab mate ticking off a task
 * should appear without anyone reloading the page.
 */
export function useProject(projectId: string | undefined) {
  const [bundle, setBundle] = useState<ProjectBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const reload = useCallback(async () => {
    if (!projectId || inFlight.current) return;
    inFlight.current = true;
    try {
      setError(null);
      setBundle(await fetchBundle(projectId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      inFlight.current = false;
    }
  }, [projectId]);

  useEffect(() => {
    setBundle(null);
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!projectId || !isConfigured) return;

    // Several rows often change at once, for instance when a task is marked
    // done and its progress note is written. Coalesce them into one refetch.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const nudge = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void reload(), 350);
    };

    const channel = supabase.channel(`project:${projectId}`);
    for (const table of ["tasks", "milestones", "risks", "updates", "links", "project_members"]) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `project_id=eq.${projectId}` },
        nudge
      );
    }
    // RACI rows carry no project_id, so they cannot be filtered server side.
    channel.on("postgres_changes", { event: "*", schema: "public", table: "raci_assignments" }, nudge);
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [projectId, reload]);

  return { bundle, error, reload, loading: bundle === null && error === null };
}

/* ------------------------------------------------------------------ misc */

/** Runs an async action, exposing a pending flag and the last error. */
export function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setPending(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setPending(false);
    }
  }, []);

  return { run, pending, error, setError };
}

/** Closes a dialog on Escape and traps initial focus. */
export function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const first = ref.current?.querySelector<HTMLElement>(
      "input, textarea, select, button:not([data-close])"
    );
    first?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return ref;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
