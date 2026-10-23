-- Optional fast path for the server-side upcoming list. Apply after 025.
begin;
create or replace function public.get_upcoming_schedule_summaries(at_time timestamptz,until_time timestamptz,include_flash boolean default true)
returns table(schedule_id uuid,title text,schedule_type text,status text,location text,start_at timestamptz,end_at timestamptz,registration_end_at timestamptz,capacity integer)
language sql stable security invoker set search_path=public,pg_temp as $$
 with nearest_regular as (
  select s.* from public.schedules s where s.deleted_at is null and s.schedule_type='regular'
   and s.status not in ('completed','cancelled') and s.end_at>=at_time order by s.start_at,s.schedule_id limit 1
 ), nearest_training as (
  select s.* from public.schedules s where s.deleted_at is null and s.schedule_type='training'
   and s.status not in ('completed','cancelled') and s.end_at>=at_time order by s.start_at,s.schedule_id limit 1
 ), candidates as (
  select * from nearest_regular union all select * from nearest_training union all
  select s.* from public.schedules s where s.deleted_at is null and (s.schedule_type='event' or (include_flash and s.schedule_type='flash'))
   and s.status not in ('completed','cancelled') and s.end_at>=at_time and s.start_at<=until_time
 )
 select s.schedule_id,s.title::text,s.schedule_type::text,s.status::text,s.location::text,s.start_at,s.end_at,s.registration_end_at,s.capacity
 from candidates s order by s.start_at,s.schedule_id;
$$;
-- The app already authorizes the request before using its server-only client.
-- No authenticated/anonymous client RPC exposure or existing RLS changes.
revoke all on function public.get_upcoming_schedule_summaries(timestamptz,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.get_upcoming_schedule_summaries(timestamptz,timestamptz,boolean) to service_role;
notify pgrst,'reload schema';
commit;
