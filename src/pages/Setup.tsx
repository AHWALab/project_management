/**
 * Shown instead of a blank page when the two Supabase environment variables
 * are missing. It is the first thing a new clone shows, so it doubles as the
 * quick start.
 */
export default function Setup() {
  return (
    <main className="min-h-dvh px-5 py-12">
      <div className="mx-auto" style={{ maxWidth: 620 }}>
        <h1 className="mb-2">Connect a database to finish setup</h1>
        <p className="text-ink-2 mb-7">
          The interface is built and ready. It needs the address of your Supabase project before it
          can sign anyone in.
        </p>

        <ol className="space-y-5">
          {[
            {
              t: "Create a free Supabase project",
              b: (
                <>
                  Go to{" "}
                  <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">
                    supabase.com/dashboard
                  </a>
                  , create a project, and pick a region close to Iowa such as us-east-1.
                </>
              ),
            },
            {
              t: "Create the tables",
              b: (
                <>
                  Open the SQL editor, paste the whole of{" "}
                  <code className="mono text-[13px]">supabase/schema.sql</code> from this repository,
                  and run it once.
                </>
              ),
            },
            {
              t: "Copy the two keys",
              b: (
                <>
                  In Project settings, API, copy the project URL and the{" "}
                  <span className="font-semibold">anon public</span> key. The anon key is safe in a
                  browser; row level security is what protects the data.
                </>
              ),
            },
            {
              t: "Put them in a file named .env.local",
              b: (
                <pre className="mono text-[12.5px] bg-raised border border-line rounded-md p-3 mt-2 overflow-x-auto">
                  {`VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co\nVITE_SUPABASE_ANON_KEY=eyJhbGci...`}
                </pre>
              ),
            },
            {
              t: "Restart the dev server",
              b: (
                <>
                  Vite only reads environment files at start up. Stop it and run{" "}
                  <code className="mono text-[13px]">npm run dev</code> again.
                </>
              ),
            },
          ].map((s, i) => (
            <li key={s.t} className="flex gap-3.5">
              <span
                className="mono shrink-0 grid place-items-center w-6 h-6 rounded-full text-[12px] font-semibold"
                style={{ background: "var(--c-reach-soft)", color: "var(--c-reach)" }}
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                <h3>{s.t}</h3>
                <div className="text-sm text-ink-2 mt-0.5">{s.b}</div>
              </div>
            </li>
          ))}
        </ol>

        <p className="text-[13px] text-ink-3 mt-8">
          Full instructions, including the reminder emails and publishing to GitHub Pages, are in the
          README.
        </p>
      </div>
    </main>
  );
}
