-- Run after 021. Server-side schedule, independent of open browser tabs.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('runners-close-regular-attendance','* * * * *','select public.close_due_regular_attendance();');
-- Verify: select jobid,jobname,schedule,active from cron.job where jobname='runners-close-regular-attendance';
