import { useState } from "react";
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

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
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
    if (err) setError(err.message);
    else setSent(true);
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
              on this device. The link works once and expires in an hour.
            </p>
            <button
              className="btn mt-4"
              onClick={() => {
                setSent(false);
                setError(null);
              }}
            >
              Use a different address
            </button>
          </div>
        ) : (
          <form onSubmit={send} className="border border-line rounded-lg bg-surface p-5">
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
            <p className="text-[13px] text-ink-3 mt-2">
              No password. We email you a link that signs you in.
            </p>
            {error && (
              <div className="mt-3">
                <ErrorNote message={error} />
              </div>
            )}
            <button type="submit" className="btn btn-primary w-full justify-center mt-4" disabled={busy}>
              {busy ? "Sending" : "Email me a sign in link"}
            </button>
          </form>
        )}

        <p className="text-[13px] text-ink-3 mt-5">
          You will only see projects you have been added to. If a project you expect is missing, ask
          whoever set it up to add your address.
        </p>
      </div>
    </main>
  );
}
