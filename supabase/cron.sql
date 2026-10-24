-- ============================================================================
-- Schedule the daily reminder email.
--
-- Run this in the Supabase SQL editor AFTER deploying the send-reminders
-- function. Replace the two placeholders first:
--
--   YOUR_PROJECT_REF   the subdomain of your Supabase URL
--   YOUR_ANON_KEY      the anon public key, used only to reach the function
--
-- The job fires at 13:00 UTC, which is 8am in Iowa during daylight saving and
-- 7am outside it. pg_cron works in UTC and does not follow the clock change.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove an earlier version of the job before adding it, so this file can be
-- run again safely.
select cron.unschedule('daily-project-reminders')
 where exists (select 1 from cron.job where jobname = 'daily-project-reminders');

select cron.schedule(
  'daily-project-reminders',
  '0 13 * * *',
  $$
  select net.http_post(
    url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer YOUR_ANON_KEY'
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Useful afterwards:
--   select * from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 10;
--   select * from net._http_response order by created desc limit 10;
