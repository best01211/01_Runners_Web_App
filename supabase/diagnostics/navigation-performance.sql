-- Read-only: run with representative production data in the SQL editor.
-- Existing profiles.user_id and system_settings.setting_key keys plus
-- withdrawals_one_pending(user_id) already cover authorization lookups.
select schemaname, tablename, indexname, indexdef from pg_indexes
where schemaname = 'public' and tablename in
('profiles','withdrawal_requests','system_settings','schedules','attendances','schedule_participations');

explain (analyze, buffers)
select setting_value from public.system_settings where setting_key='maintenance';

-- Replace placeholders with a test account and representative season dates.
-- EXPLAIN (ANALYZE, BUFFERS) SELECT request_id FROM public.withdrawal_requests
-- WHERE user_id='<test-user-uuid>' AND status='pending';
-- EXPLAIN (ANALYZE, BUFFERS) SELECT attendance_id,user_id,schedule_id,status
-- FROM public.attendances WHERE status IN ('attended','late','absent')
-- ORDER BY attendance_id LIMIT 500;
-- Consider schedules(start_at) WHERE deleted_at IS NULL and
-- schedule_participations(schedule_id,participation_id) WHERE is_pacer=true
-- only if plans show material scans/sorts. No speculative index or RLS change.
