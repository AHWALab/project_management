import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isConfigured } from "./supabase";
import { fetchBundle, fetchProjects } from "./db";
import type { ProjectBundle, ProjectRollup, Task } from "./types";

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
  const queued = useRef(false);

  /**
   * Changes shown on screen before the server has confirmed them, by task.
   *
   * Each reload is numbered when it starts. A change is kept laid over the
   * screen until a reload that STARTED after the change's write finished has
   * landed. Dropping it the moment the write finished was not enough: a reload
   * issued before the write could still land afterwards, carrying the old
   * value, and put it back on screen for a second or two.
   */
  const pending = useRef<Map<string, { patch: Partial<Task>; settledGen: number | null }>>(new Map());
  const gen = useRef(0);

  const overlay = useCallback((b: ProjectBundle | null, landedGen: number): ProjectBundle | null => {
    if (!b) return b;
    for (const [id, entry] of pending.current) {
      if (entry.settledGen !== null && landedGen > entry.settledGen) pending.current.delete(id);
    }
    if (pending.current.size === 0) return b;
    return {
      ...b,
      tasks: b.tasks.map((t) => {
        const p = pending.current.get(t.id);
        return p ? { ...t, ...p.patch } : t;
      }),
    };
  }, []);

  /**
   * Shows a task change at once, ahead of the server. Returns a function to
   * call once the write has finished, succeeded or not.
   */
  const patchTask = useCallback(
    (id: string, patch: Partial<Task>): (() => void) => {
      const prev = pending.current.get(id);
      pending.current.set(id, { patch: { ...(prev?.patch ?? {}), ...patch }, settledGen: null });
      setBundle((b) => overlay(b, 0));
      return () => {
        const entry = pending.current.get(id);
        if (entry) entry.settledGen = gen.current;
      };
    },
    [overlay]
  );

  /**
   * Refetches everything. A reload asked for while one is already running is
   * not dropped but run once more afterwards, so the screen always ends up
   * showing the last write. Dropping it was why a change made during a
   * refresh never appeared until the panel was reopened.
   */
  const reload = useCallback(async () => {
    if (!projectId) return;
    if (inFlight.current) {
      queued.current = true;
      return;
    }
    inFlight.current = true;
    try {
      do {
        queued.current = false;
        setError(null);
        const myGen = ++gen.current;
        const fresh = await fetchBundle(projectId);
        setBundle(overlay(fresh, myGen));
      } while (queued.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      inFlight.current = false;
      queued.current = false;
    }
  }, [projectId]);

  useEffect(() => {
    setBundle(null);
    void reload();
  }, [reload]);

  return { bundle, error, reload, patchTask, loading: bundle === null && error === null };
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
