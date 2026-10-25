-- Production FK diagnosis confirmed legacy attendance_sessions -> attendance_records.
-- Includes the 038 notification fix; safe to apply after 038 or directly after 025.
begin;
create or replace function public.delete_schedule_tree(target_table oid,row_filter text,depth integer default 0)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare name text; relation_name text; fk record; amount bigint; child_filter text;
begin
 if depth>12 then raise exception 'DELETE_DEPENDENCY_TOO_DEEP'; end if;
 select format('%I.%I',n.nspname,c.relname),c.relname into name,relation_name from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.oid=target_table and n.nspname='public';
 if relation_name is null or relation_name not in ('schedules','pace_groups','schedule_pace_groups','schedule_participations','attendances','attendance_sessions','attendance_records','attendance_record_history','attendance_record_audits','comments','schedule_comments','race_courses','race_entries','runner_checkpoints','admin_schedule_tests','member_notifications') then raise exception 'UNSUPPORTED_SCHEDULE_DEPENDENCY'; end if;
 execute format('select count(*) from %s where %s',name,row_filter) into amount;
 if amount=0 then return; end if;
 for fk in select c.conrelid,c.conkey,n.nspname,t.relname,a.attname,p.attname parent_column
  from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
  join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
  join pg_attribute p on p.attrelid=c.confrelid and p.attnum=c.confkey[1]
  where c.contype='f' and c.confrelid=target_table loop
  if fk.nspname<>'public' or array_length(fk.conkey,1)<>1 then raise exception 'UNSUPPORTED_SCHEDULE_DEPENDENCY'; end if;
  child_filter:=format('%I in (select %I from %s where %s)',fk.attname,fk.parent_column,name,row_filter);
  perform public.delete_schedule_tree(fk.conrelid,child_filter,depth+1);
 end loop;
 execute format('delete from %s where %s',name,row_filter);
end $$;
revoke all on function public.delete_schedule_tree(oid,text,integer) from public,anon,authenticated,service_role;

notify pgrst,'reload schema';
commit;
