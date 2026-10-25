-- Read-only diagnosis. Run in the SAME Supabase project used by the deployed app.
-- No schedule or related record is changed or deleted.
select current_database() as database_name,
       to_regprocedure('public.delete_cancelled_schedule(uuid,text)') as entry_function,
       to_regprocedure('public.delete_schedule_tree(oid,text,integer)') as tree_function;

select p.oid::regprocedure as function_name,
       pg_get_userbyid(p.proowner) as owner,
       p.prosecdef as security_definer,
       case when p.proname='delete_schedule_tree'
            then position('member_notifications' in pg_get_functiondef(p.oid))>0 end as includes_notifications,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('delete_cancelled_schedule','delete_schedule_tree');

-- List all reachable FK dependencies, including production-only tables.
with recursive dependencies as (
 select 'public.schedules'::regclass::oid as relation_oid,array['public.schedules'::regclass::oid] as visited,0 as depth
 union all
 select c.conrelid,d.visited||c.conrelid,d.depth+1
 from dependencies d join pg_constraint c on c.confrelid=d.relation_oid and c.contype='f'
 where not c.conrelid=any(d.visited) and d.depth<12
)
select distinct c.conname,c.confrelid::regclass as parent_table,c.conrelid::regclass as child_table,
 pg_get_constraintdef(c.oid) as definition
from dependencies d join pg_constraint c on c.confrelid=d.relation_oid and c.contype='f'
order by 2,3,1;
