# AHWA Projects

Project tracking for the lab: a timeline per project, a RACI matrix, milestones,
a risk register, and a place for people to report progress and link to the data.
Signing in is by emailed link, so there are no passwords to hand round, and
everyone only sees the projects they have been added to.

Built from the two spreadsheets the lab already uses, `AHWA_RACI_Template.xlsx`
and `Template_Project_Progress.xlsx`, so the fields match what you are used to.

## What is here

| Path | What it is |
| --- | --- |
| `src/` | The web interface. React, TypeScript, Tailwind, GSAP. |
| `supabase/schema.sql` | Every table, plus the rules about who may read and write what. Run once. |
| `supabase/functions/send-reminders/` | The daily reminder email job. |
| `supabase/cron.sql` | Schedules that job. Run after deploying the function. |
| `.github/workflows/deploy.yml` | Builds and publishes to GitHub Pages on every push to `main`. |

## Setting it up

You need two free accounts: Supabase, which stores the data and signs people in,
and Resend, which sends the reminder emails. Reminders are optional and can be
added later; steps 1 to 4 give you a working board.

### 1. Create the database

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and create a
   project. Pick a region near Iowa, such as `us-east-1`.
2. Open **SQL Editor**, click **New query**, paste the whole of
   `supabase/schema.sql`, and run it. It is safe to run again later.
3. Open **Project Settings, API** and copy two things: the **Project URL** and
   the **anon public** key.

The anon key goes in the browser and that is fine. The rules in `schema.sql`
are what keep one project's data away from people who are not on it.

### 2. Point the app at it

```bash
npm install
cp .env.example .env.local
```

Put your two values in `.env.local`:

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

Then:

```bash
npm run dev
```

Open the address it prints, enter your email, and click the link that arrives.
Your first sign in creates your profile automatically. Create a project, add
your lab mates on the **Team** tab, and you are running.

### 3. Let Supabase send the sign in emails

Out of the box Supabase sends sign in links from its own shared address, which
is rate limited to a handful an hour. That is enough to try it out, not enough
for a lab.

Open **Authentication, URL Configuration** and set:

- **Site URL** to wherever the app will live, for example
  `https://ahwalab.github.io/project_management/`
- **Redirect URLs**: add both that address and `http://localhost:5173` so sign
  in works locally too.

If the links stop arriving, that rate limit is the usual reason. Connect your
own SMTP under **Project Settings, Authentication, SMTP Settings**, using the
same Resend account as step 5.

### 4. Publish it

```bash
git add -A
git commit -m "Set up the project board"
git push
```

Then in the repository on GitHub:

1. **Settings, Pages**, set **Source** to **GitHub Actions**.
2. **Settings, Secrets and variables, Actions**, add two repository secrets
   named `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with the same values
   as `.env.local`.
3. Push again, or run the workflow by hand from the **Actions** tab.

It publishes to `https://<owner>.github.io/project_management/`. If you use a
custom domain instead, set `BASE_PATH=/` when building.

### 5. Turn on reminder emails

Reminders go to whoever owns a task or milestone, once each at a week out, a day
out, and on the day, and then once a week while it is late, stopping after eight
weeks. Everything due for one person arrives as a single email, not one per task.

1. Create an account at [resend.com](https://resend.com) and verify a domain you
   can send from. The free tier covers a lab many times over.
2. Install the Supabase CLI and deploy the function:

   ```bash
   npm install -g supabase
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase functions deploy send-reminders --no-verify-jwt
   ```

3. Set its secrets:

   ```bash
   supabase secrets set \
     RESEND_API_KEY=re_xxxxxxxx \
     REMINDER_FROM="AHWA Projects <projects@yourdomain.org>" \
     APP_URL="https://ahwalab.github.io/project_management/"
   ```

4. Check who it would email before it emails anyone:

   ```bash
   curl "https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-reminders?dry=1" \
     -H "Authorization: Bearer YOUR_ANON_KEY"
   ```

   It returns the list of people and what each would be told, and sends nothing.

5. Schedule it: open `supabase/cron.sql`, replace `YOUR_PROJECT_REF` and
   `YOUR_ANON_KEY`, and run it in the SQL editor. It fires at 13:00 UTC, which
   is 8am in Iowa in summer and 7am in winter.

## How it works

**Signing in.** There are no passwords. Supabase emails a one time link. The
first time someone signs in, a trigger creates their profile and claims any
seats that were created for their email address, which is how being added to a
project before you have an account works.

**Who can see what.** Every table has row level security. A person sees a
project only if there is a row in `project_members` joining them to it.
Membership is checked through a `security definer` function because a policy
that queried the membership table directly would recurse. Admins manage the
roster and can delete a project; everyone else can do the work but not change
who is on it.

**Tasks and groups.** One table holds both. A row with `is_summary` is a WBS
heading, and its dates and percentage are rolled up from its children rather
than stored. Ending a task title with a colon when you add it makes it a group.

**The RACI check.** Same rule as the spreadsheet: exactly one person
accountable, at least one responsible. Failing rows are counted on the tab
itself so they cannot be missed.

**Risk scores.** Likelihood times consequence, both one to five, exactly as the
template does it. Fifteen and above is high.

**Colour.** Four colours carry meaning and nothing else is tinted: teal on
track, ochre due within a week, brick overdue, green done. They mean the same
thing on the tiles, the timeline, the milestone list and in the emails.

## Day to day

```bash
npm run dev        # work on it
npm run typecheck  # what CI checks
npm run build      # production build into dist/
npm run preview    # serve that build locally
```

## If something is wrong

**A blank page, or a setup screen.** The two environment variables are missing.
Vite only reads `.env.local` at start up, so restart `npm run dev` after editing
it.

**Sign in links never arrive.** Supabase's built in email is rate limited to a
few per hour. Check the spam folder first, then connect your own SMTP.

**Signing in works but no projects appear.** That is correct behaviour for
someone who has not been added to any. Have an admin add their address on the
Team tab, exactly as they typed it when signing in.

**A reload on a project page shows a 404.** The deploy step that copies
`index.html` to `404.html` did not run. Re-run the workflow.

**Reminders are not arriving.** Run the `?dry=1` call above. If it lists nobody,
either nothing is near its date or the items have no owner, since reminders are
addressed to owners. Then check `select * from cron.job_run_details order by
start_time desc limit 10;`.
