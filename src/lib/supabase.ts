import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when the two environment variables are present and look plausible. */
export const isConfigured = Boolean(url && anonKey && url.startsWith("http"));

if (!isConfigured) {
  // Surfaced in the interface as a setup screen rather than a blank page.
  console.warn(
    "Supabase is not configured. Copy .env.example to .env.local and fill in " +
      "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
  );
}

export const supabase = createClient(
  url ?? "https://placeholder.supabase.co",
  anonKey ?? "placeholder",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  }
);

/**
 * Where the magic link should land. GitHub Pages serves the app from a
 * subpath, and the link must come back to exactly that origin plus path or
 * Supabase refuses it.
 */
export function redirectUrl(): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${window.location.origin}${base}`;
}
