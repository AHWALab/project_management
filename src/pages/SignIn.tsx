import { useEffect, useState } from "react";
import { supabase, redirectUrl } from "../lib/supabase";
import { ErrorNote } from "../components/bits";

/**
 * The mark: a stage trace crossing a threshold. It is the one piece of
 * decoration in the app, and it is here because this screen has nothing else
 * to say while someone waits for an email.
 */
function Trace() {
  return (
    <svg viewBox="0 0 320 90" className="w-full h-auto" aria-hidden="true">
      <line x1="0" y1="58" x2="320" y2="58" stroke="var(--c-line)" strokeWidth="1" strokeDasharray="3 4" />
      <path
        d="M0 74 C 26 74, 40 70, 58 62 S 86 30, 108 26 S 140 44, 160 52 S 196 66, 220 60 S 262 36, 290 30 L 320 26"
        fill="none"
        stroke="var(--c-reach)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="108" cy="26" r="3.5" fill="var(--c-reach)" />
    </svg>
  );
}

type Mode = "link" | "password";
const MODE_KEY = "ahwa.signin.mode";

function readMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === "password" ? "password" : "link";
  } catch {
    // Private windows and blocked site data both land here.
    return "link";
  }
}

export default function SignIn() {
  // Whichever way you got in last time is the way offered first next time.
  const [mode, setMode] = useState<Mode>(readMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* Not remembering the choice is not worth interrupting anyone. */
    }
  }, [mode]);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    if (!address) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: redirectUrl() },
    });
    setBusy(false);
    if (!err) {
      setSent(true);
      return;
    }
    // The built in sender is throttled, and the raw message does not say what
    // to do about it.
    if (/rate limit/i.test(err.message)) {
      setError(
        "Too many sign in emails in the last hour. Use a password below, or try again later."
      );
      return;
    }
    setError(err.message);
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    if (!address || !password) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: address,
      password,
    });
    setBusy(false);
    if (!err) return; // The session arrives and the app re-renders itself.
    if (/invalid login credentials/i.test(err.message)) {
      setError(
        "That email and password do not match an account. If you have never set a password, sign in with an emailed link instead."
      );
      return;
    }
    setError(err.message);
  }

  return (
    <main className="min-h-dvh grid place-items-center px-5 py-12">
      <div className="w-full" style={{ maxWidth: 400 }}>
        <div className="mb-7">
          <Trace />
        </div>

        <h1 className="mb-1.5">AHWA Projects</h1>
        <p className="text-ink-2 text-[15px] mb-7">
          Timelines, responsibilities, and progress for the lab&rsquo;s projects, in one place.
        </p>

        {sent ? (
          <div className="border border-line rounded-lg bg-surface p-5">
            <h2 className="mb-1.5">Check your inbox</h2>
            <p className="text-sm text-ink-2">
              A sign in link is on its way to{" "}
              <span className="mono text-ink font-medium">{email.trim().toLowerCase()}</span>. Open it
              in this browser. The link works once and expires in an hour.
            </p>
            <button
              className="btn mt-4"
              onClick={() => {
                setSent(false);
                setError(null);
              }}
            >
              Back
            </button>
          </div>
        ) : (
          <div className="border border-line rounded-lg bg-surface p-5">
            <div
              className="flex gap-0.5 p-0.5 rounded-md mb-4"
              style={{ background: "var(--c-raised)", border: "1px solid var(--c-line)" }}
              role="tablist"
              aria-label="How to sign in"
            >
              {(
                [
                  ["link", "Emailed link"],
                  ["password", "Password"],
                ] as [Mode, string][]
              ).map(([m, labelText]) => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => {
                    setMode(m);
                    setError(null);
                  }}
                  className="flex-1 rounded py-1.5 text-[13.5px] font-semibold transition"
                  style={{
                    background: mode === m ? "var(--c-surface)" : "transparent",
                    color: mode === m ? "var(--c-ink)" : "var(--c-ink-3)",
                    boxShadow: mode === m ? "0 1px 2px rgb(0 0 0 / 0.08)" : undefined,
                  }}
                >
                  {labelText}
                </button>
              ))}
            </div>

            <form onSubmit={mode === "link" ? sendLink : signInWithPassword}>
              <label htmlFor="email" className="block text-sm font-semibold mb-1.5">
                Your email
              </label>
              <input
                id="email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                placeholder="you@uiowa.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field mono"
              />

              {mode === "password" ? (
                <>
                  <label htmlFor="password" className="block text-sm font-semibold mb-1.5 mt-3.5">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="field"
                  />
                  <p className="text-[13px] text-ink-3 mt-2">
                    Only works if a password has been set for your account. You can set one from the
                    account menu once you are signed in.
                  </p>
                </>
              ) : (
                <p className="text-[13px] text-ink-3 mt-2">
                  No password. We email you a link that signs you in.
                </p>
              )}

              {error && (
                <div className="mt-3">
                  <ErrorNote message={error} />
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary w-full justify-center mt-4"
                disabled={busy || !email.trim() || (mode === "password" && !password)}
              >
                {busy
                  ? mode === "link"
                    ? "Sending"
                    : "Signing in"
                  : mode === "link"
                    ? "Email me a sign in link"
                    : "Sign in"}
              </button>
            </form>
          </div>
        )}

        <p className="text-[13px] text-ink-3 mt-5">
          You will only see projects you have been added to. If a project you expect is missing, ask
          whoever set it up to add your address.
        </p>
      </div>
    </main>
  );
}
