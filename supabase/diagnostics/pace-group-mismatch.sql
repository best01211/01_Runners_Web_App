-- Read-only. Run the entire file: all diagnostics are returned in ONE result.
-- No participation, schedule, trigger, or policy is changed.
select 'validation_function' as section,
       jsonb_build_object('function',p.proname,'owner',pg_get_userbyid(p.proowner),
         'security_definer',p.prosecdef,'definition',pg_get_functiondef(p.oid)) as data
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f' and p.prosrc like '%PACE_GROUP_SCHEDULE_MISMATCH%'
union all
select 'trigger',jsonb_build_object('table',t.tgrelid::regclass::text,'name',t.tgname,
  'definition',pg_get_triggerdef(t.oid),'function',pg_get_functiondef(t.tgfoid))
from pg_trigger t where not t.tgisinternal
  and t.tgrelid in ('public.schedule_participations'::regclass,'public.pace_groups'::regclass)
union all
select 'pace_group',jsonb_build_object('group',to_jsonb(g),'schedule_title',s.title,
  'schedule_exists',s.schedule_id is not null)
from public.pace_groups g left join public.schedules s on s.schedule_id=g.schedule_id
union all
select 'constraint',jsonb_build_object('table',c.conrelid::regclass::text,
  'name',c.conname,'definition',pg_get_constraintdef(c.oid))
from pg_constraint c where c.conrelid in ('public.schedule_participations'::regclass,'public.pace_groups'::regclass);
