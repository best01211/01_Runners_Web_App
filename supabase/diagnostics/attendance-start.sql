-- Read-only: diagnose participation AND attendance schema differences.
-- 1. Actual columns, required fields, defaults, and allowed enum labels.
select n.nspname as schema_name,c.relname as table_name,a.attname as column_name,
       format_type(a.atttypid,a.atttypmod) as column_type,a.attnotnull as required,
       (select pg_get_expr(d.adbin,d.adrelid) from pg_attrdef d where d.adrelid=a.attrelid and d.adnum=a.attnum) as default_value,
       (select string_agg(e.enumlabel, ', ' order by e.enumsortorder) from pg_enum e where e.enumtypid=a.atttypid) as allowed_values
from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('schedules','schedule_participations','attendances')
  and a.attnum > 0 and not a.attisdropped order by c.relname,a.attnum;

-- 2. Constraints that can reject inserts or schedule status transitions.
select c.conrelid::regclass as table_name,c.conname,pg_get_constraintdef(c.oid) as definition
from pg_constraint c
where c.conrelid in ('public.schedules'::regclass,'public.schedule_participations'::regclass,'public.attendances'::regclass)
order by c.conrelid::regclass::text,c.conname;

-- 3. Custom triggers invoked by attendance start.
select t.tgrelid::regclass as table_name,t.tgname,pg_get_triggerdef(t.oid) as trigger_definition,pg_get_functiondef(t.tgfoid) as function_definition
from pg_trigger t where not t.tgisinternal
  and t.tgrelid in ('public.schedules'::regclass,'public.schedule_participations'::regclass,'public.attendances'::regclass)
order by t.tgrelid::regclass::text,t.tgname;

-- 4. Actual deployed RPC and executable permission.
select p.proname as function_name,pg_get_functiondef(p.oid) as function_definition,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('write_attendance','register_schedule_participation_with_group','cancel_schedule_participation','change_participation_group');
