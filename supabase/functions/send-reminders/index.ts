// Daily reminder job.
//
// Finds unfinished tasks and milestones that are approaching their date or have
// passed it, and emails the person who owns them. One email per person per run,
// listing everything of theirs, rather than one email per item.
//
// Runs on Supabase Edge Functions (Deno). Deploy with:
//   supabase functions deploy send-reminders --no-verify-jwt
//
// Required secrets:
//   RESEND_API_KEY   from resend.com
//   REMINDER_FROM    e.g. "AHWA Projects <projects@yourdomain.org>"
//   APP_URL          e.g. "https://ahwalab.github.io/project_management/"
// Provided automatically by the platform:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "jsr:@supabase/supabase-js@2";

type Stage = "T-7" | "T-1" | "due" | string;

interface Item {
  entity: "task" | "milestone";
  id: string;
  title: string;
  due: string;
  daysOut: number;
  stage: Stage;
  project: string;
  projectId: string;
}

const DAY = 86_400_000;

/** Stop nagging after this long. By then the date is wrong, not the person. */
const GIVE_UP_WEEKS = 8;

/**
 * Which reminder, if any, today warrants for a given due date.
 *
 * The early stages are windows rather than exact day counts on purpose. If the
 * cron job misses a day, an exact match on "seven days out" would skip that
 * reminder for good; a window still catches it the next morning, and the
 * reminder log stops it going out twice.
 */
function stageFor(daysOut: number): Stage | null {
  if (daysOut >= 5 && daysOut <= 8) return "T-7";
  if (daysOut >= 1 && daysOut <= 2) return "T-1";
  if (daysOut === 0) return "due";
  if (daysOut < 0) {
    // At most one nudge per week once something is late, so a forgotten task
    // does not turn into daily noise that everyone learns to ignore.
    const weeksLate = Math.floor(Math.abs(daysOut) / 7);
    if (weeksLate >= GIVE_UP_WEEKS) return null;
    return `overdue-w${weeksLate}`;
  }
  return null;
}

function daysBetween(dueIso: string, todayIso: string): number {
  return Math.round((Date.parse(dueIso) - Date.parse(todayIso)) / DAY);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function phrase(daysOut: number): string {
  if (daysOut === 0) return "due today";
  if (daysOut === 1) return "due tomorrow";
  if (daysOut > 1) return `due in ${daysOut} days`;
  const n = Math.abs(daysOut);
  return n === 1 ? "1 day late" : `${n} days late`;
}

function buildEmail(name: string, items: Item[], appUrl: string) {
  const late = items.filter((i) => i.daysOut < 0);
  const soon = items.filter((i) => i.daysOut >= 0);

  const subject =
    late.length > 0
      ? `${late.length} late and ${soon.length} coming up on your projects`
      : soon.length === 1
        ? `${soon[0].title} is ${phrase(soon[0].daysOut)}`
        : `${soon.length} items coming up on your projects`;

  const row = (i: Item) => `
    <tr>
      <td style="padding:7px 12px 7px 0;vertical-align:top;">
        <div style="font-weight:600;color:#15202b;">${escapeHtml(i.title)}</div>
        <div style="color:#5b6a72;font-size:13px;">${escapeHtml(i.project)}${
          i.entity === "milestone" ? " &middot; milestone" : ""
        }</div>
      </td>
      <td style="padding:7px 0;vertical-align:top;text-align:right;white-space:nowrap;
                 color:${i.daysOut < 0 ? "#a3362e" : i.daysOut <= 7 ? "#b8771f" : "#2c6e7f"};
                 font-weight:600;font-size:13px;">
        ${escapeHtml(phrase(i.daysOut))}<br>
        <span style="font-weight:400;color:#74837d;">${escapeHtml(i.due)}</span>
      </td>
    </tr>`;

  const section = (label: string, list: Item[]) =>
    list.length === 0
      ? ""
      : `<p style="margin:22px 0 4px;font-size:13px;font-weight:700;color:#5b6a72;">${label}</p>
         <table style="width:100%;border-collapse:collapse;">${list.map(row).join("")}</table>`;

  const html = `<!doctype html><html><body style="margin:0;background:#f1f4f3;">
  <div style="max-width:560px;margin:0 auto;padding:28px 20px;font-family:-apple-system,
              BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#15202b;
              font-size:15px;line-height:1.55;">
    <p style="margin:0 0 2px;">Hello ${escapeHtml(name)},</p>
    <p style="margin:0;color:#5b6a72;">Here is what has your name on it.</p>
    ${section("Already late", late)}
    ${section("Coming up", soon)}
    <p style="margin:26px 0 0;">
      <a href="${escapeHtml(appUrl)}"
         style="display:inline-block;background:#2c6e7f;color:#fff;text-decoration:none;
                padding:9px 16px;border-radius:4px;font-weight:600;font-size:14px;">
        Open the project board
      </a>
    </p>
    <p style="margin:22px 0 0;color:#74837d;font-size:12.5px;">
      Sent once a day, only when something of yours is close to its date or past it.
    </p>
  </div></body></html>`;

  const text =
    `Hello ${name},\n\nHere is what has your name on it.\n\n` +
    (late.length ? `Already late\n${late.map((i) => `  ${i.title} (${i.project}) ${phrase(i.daysOut)}, due ${i.due}`).join("\n")}\n\n` : "") +
    (soon.length ? `Coming up\n${soon.map((i) => `  ${i.title} (${i.project}) ${phrase(i.daysOut)}, due ${i.due}`).join("\n")}\n\n` : "") +
    `${appUrl}\n`;

  return { subject, html, text };
}

Deno.serve(async (req: Request) => {
  const started = Date.now();
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("REMINDER_FROM");
  const appUrl = Deno.env.get("APP_URL") ?? "";

  if (!url || !key) {
    return Response.json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  // dryRun lets you see exactly who would be emailed before switching it on.
  const dryRun = new URL(req.url).searchParams.get("dry") === "1";
  if (!dryRun && (!resendKey || !from)) {
    return Response.json(
      { error: "Missing RESEND_API_KEY or REMINDER_FROM. Call with ?dry=1 to test without them." },
      { status: 500 }
    );
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 8 * DAY).toISOString().slice(0, 10);

  // Only active projects. Nobody wants reminders about something archived.
  const { data: projects, error: pErr } = await db
    .from("projects")
    .select("id,name,status")
    .in("status", ["active", "on_hold"]);
  if (pErr) return Response.json({ error: pErr.message }, { status: 500 });

  const projectName = new Map((projects ?? []).map((p) => [p.id, p.name as string]));
  const projectIds = [...projectName.keys()];
  if (projectIds.length === 0) return Response.json({ ok: true, sent: 0, note: "no active projects" });

  const [{ data: members }, { data: profiles }, { data: tasks }, { data: milestones }] =
    await Promise.all([
      db.from("project_members").select("id,project_id,user_id,invited_email,display_name").in("project_id", projectIds),
      db.from("profiles").select("id,email,full_name"),
      db
        .from("tasks")
        .select("id,project_id,title,end_date,status,owner_id,is_summary")
        .in("project_id", projectIds)
        .eq("is_summary", false)
        .neq("status", "done")
        .not("end_date", "is", null)
        .lte("end_date", horizon),
      db
        .from("milestones")
        .select("id,project_id,title,due_date,completion_date,owner_id")
        .in("project_id", projectIds)
        .is("completion_date", null)
        .not("due_date", "is", null)
        .lte("due_date", horizon),
    ]);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const memberById = new Map((members ?? []).map((m) => [m.id, m]));

  /** The address to reach a member at, and the name to greet them by. */
  function contact(memberId: string | null): { email: string; name: string } | null {
    if (!memberId) return null;
    const m = memberById.get(memberId);
    if (!m) return null;
    if (m.user_id) {
      const p = profileById.get(m.user_id);
      if (p?.email) return { email: p.email, name: (p.full_name as string) || m.display_name };
    }
    // Someone invited but not yet signed in still gets reminded, which is often
    // what finally makes them sign in.
    if (m.invited_email) return { email: m.invited_email, name: m.display_name };
    return null;
  }

  const candidates: { to: { email: string; name: string }; item: Item }[] = [];

  for (const t of tasks ?? []) {
    const daysOut = daysBetween(t.end_date as string, today);
    const stage = stageFor(daysOut);
    if (!stage) continue;
    const to = contact(t.owner_id as string | null);
    if (!to) continue;
    candidates.push({
      to,
      item: {
        entity: "task",
        id: t.id as string,
        title: t.title as string,
        due: t.end_date as string,
        daysOut,
        stage,
        project: projectName.get(t.project_id as string) ?? "",
        projectId: t.project_id as string,
      },
    });
  }

  for (const m of milestones ?? []) {
    const daysOut = daysBetween(m.due_date as string, today);
    const stage = stageFor(daysOut);
    if (!stage) continue;
    const to = contact(m.owner_id as string | null);
    if (!to) continue;
    candidates.push({
      to,
      item: {
        entity: "milestone",
        id: m.id as string,
        title: m.title as string,
        due: m.due_date as string,
        daysOut,
        stage,
        project: projectName.get(m.project_id as string) ?? "",
        projectId: m.project_id as string,
      },
    });
  }

  if (candidates.length === 0) {
    return Response.json({ ok: true, sent: 0, considered: 0, ms: Date.now() - started });
  }

  // Drop anything this exact reminder has already gone out for.
  const { data: alreadySent } = await db
    .from("reminder_log")
    .select("entity,entity_id,recipient,stage")
    .in("entity_id", candidates.map((c) => c.item.id));

  const seen = new Set(
    (alreadySent ?? []).map((r) => `${r.entity}|${r.entity_id}|${r.recipient}|${r.stage}`)
  );

  const fresh = candidates.filter(
    (c) => !seen.has(`${c.item.entity}|${c.item.id}|${c.to.email}|${c.item.stage}`)
  );

  // One message per person, covering everything of theirs.
  const byPerson = new Map<string, { name: string; items: Item[] }>();
  for (const c of fresh) {
    const key = c.to.email.toLowerCase();
    const row = byPerson.get(key);
    if (row) row.items.push(c.item);
    else byPerson.set(key, { name: c.to.name, items: [c.item] });
  }
  for (const row of byPerson.values()) {
    row.items.sort((a, b) => a.daysOut - b.daysOut);
  }

  if (dryRun) {
    return Response.json({
      ok: true,
      dryRun: true,
      considered: candidates.length,
      wouldEmail: [...byPerson.entries()].map(([email, r]) => ({
        email,
        subject: buildEmail(r.name, r.items, appUrl).subject,
        items: r.items.map((i) => `${i.title} (${i.stage})`),
      })),
      ms: Date.now() - started,
    });
  }

  let sent = 0;
  const failures: { email: string; error: string }[] = [];

  for (const [email, row] of byPerson) {
    const { subject, html, text } = buildEmail(row.name, row.items, appUrl);
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to: [email], subject, html, text }),
      });
      if (!res.ok) {
        failures.push({ email, error: `${res.status} ${await res.text()}` });
        continue;
      }
      sent += 1;

      // Logged only after the send succeeded, so a failure is retried tomorrow
      // rather than silently swallowed.
      await db.from("reminder_log").insert(
        row.items.map((i) => ({
          entity: i.entity,
          entity_id: i.id,
          recipient: email,
          stage: i.stage,
        }))
      );
    } catch (e) {
      failures.push({ email, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return Response.json({
    ok: failures.length === 0,
    sent,
    considered: candidates.length,
    skippedAlreadySent: candidates.length - fresh.length,
    failures,
    ms: Date.now() - started,
  });
});
