-- Read-only checks after applying 021 and 022.
select column_name,data_type from information_schema.columns where table_schema='public' and table_name='comments' and column_name in ('deleted_by','deleted_by_author');
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('close_due_regular_attendance','configure_season','guard_regular_attendance_deadline','is_actual_administrator');
select has_function_privilege('authenticated','public.close_due_regular_attendance()','EXECUTE') as member_cannot_close_all,
       has_function_privilege('service_role','public.close_due_regular_attendance()','EXECUTE') as service_can_close;
-- member_cannot_close_all must be false, service_can_close must be true.
select jobid,jobname,schedule,active from cron.job where jobname='runners-close-regular-attendance';
select j.jobname,d.status,d.start_time,d.end_time,d.return_message from cron.job_run_details d join cron.job j on j.jobid=d.jobid where j.jobname='runners-close-regular-attendance' order by d.start_time desc limit 5;
select policyname,permissive,cmd from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_hide_administrators';
select schedule_id,end_at,attendance_opened_at,attendance_closed_at from public.schedules where schedule_type='regular' and deleted_at is null and status<>'cancelled' and attendance_opened_at is not null and attendance_closed_at is null and end_at<=now();
-- Last query should be empty once the next scheduled minute has run.
