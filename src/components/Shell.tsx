import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { LogOut, Monitor, Moon, Sun } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { Me } from "../lib/hooks";
import { Avatar } from "./bits";

type ThemeChoice = "system" | "light" | "dark";
const THEME_KEY = "ahwa.theme";

function readTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // Private windows and blocked site data both land here; the default is fine.
  }
  return "system";
}

function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(readTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (choice === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", choice);
    try {
      localStorage.setItem(THEME_KEY, choice);
    } catch {
      // Not being able to remember the choice is not worth interrupting anyone.
    }
  }, [choice]);

  return [choice, setChoice] as const;
}

function ThemeToggle() {
  const [choice, setChoice] = useTheme();
  const order: ThemeChoice[] = ["system", "light", "dark"];
  const next = order[(order.indexOf(choice) + 1) % order.length];
  const Icon = choice === "system" ? Monitor : choice === "light" ? Sun : Moon;
  const names: Record<ThemeChoice, string> = {
    system: "Matching your system",
    light: "Light",
    dark: "Dark",
  };
  return (
    <button
      className="btn !px-2 !py-1.5"
      onClick={() => setChoice(next)}
      title={`Appearance: ${names[choice]}. Click for ${names[next].toLowerCase()}.`}
      aria-label={`Appearance: ${names[choice]}. Change to ${names[next]}.`}
    >
      <Icon size={15} />
    </button>
  );
}

export default function Shell({
  me,
  children,
  breadcrumb,
  actions,
}: {
  me: Me;
  children: ReactNode;
  breadcrumb?: ReactNode;
  actions?: ReactNode;
}) {
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menu]);

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/92 backdrop-blur-sm">
        <div className="mx-auto w-full px-4 sm:px-6" style={{ maxWidth: 1360 }}>
          <div className="h-13 flex items-center gap-3 py-2.5">
            <Link
              to="/"
              className="flex items-center gap-2 shrink-0 no-underline"
              style={{ color: "var(--c-ink)" }}
            >
              <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
                <rect width="32" height="32" rx="6" fill="var(--c-reach)" />
                <path
                  d="M5 21c4 0 4-9 8-9s4 9 8 9 2-5 6-5"
                  stroke="#fff"
                  strokeWidth="2.4"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
              <span className="font-bold tracking-tight hidden sm:inline">AHWA Projects</span>
            </Link>

            {breadcrumb && (
              <>
                <span className="text-line-strong select-none" aria-hidden="true">
                  /
                </span>
                <div className="min-w-0 flex-1">{breadcrumb}</div>
              </>
            )}

            <div className="flex-1" />
            {actions}
            <ThemeToggle />

            <div className="relative shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenu((v) => !v);
                }}
                className="rounded-full"
                aria-haspopup="menu"
                aria-expanded={menu}
                aria-label="Your account"
              >
                <Avatar name={me.name} email={me.email} size={28} title={me.email} />
              </button>
              {menu && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-1.5 w-60 bg-surface border border-line rounded-md p-1.5"
                  style={{ boxShadow: "var(--shadow-pop)" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-2 py-1.5 border-b border-line mb-1">
                    <div className="font-semibold text-sm truncate">{me.name}</div>
                    <div className="mono text-[12px] text-ink-3 truncate">{me.email}</div>
                  </div>
                  <button
                    role="menuitem"
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-raised text-left"
                    onClick={() => void supabase.auth.signOut()}
                  >
                    <LogOut size={14} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full px-4 sm:px-6 py-6 sm:py-8" style={{ maxWidth: 1360 }}>
        {children}
      </main>
    </div>
  );
}
