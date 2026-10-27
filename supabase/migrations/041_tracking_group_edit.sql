begin;
do $$ begin
 if to_regprocedure('public.write_tracking_race_before_group_edit(uuid,jsonb)') is null then
  alter function public.write_tracking_race(uuid,jsonb) rename to write_tracking_race_before_group_edit;
 end if;
end $$;
revoke all on function public.write_tracking_race_before_group_edit(uuid,jsonb) from public,anon,authenticated;
create or replace function public.write_tracking_race(target_race uuid,payload jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare root uuid; destination uuid; gid uuid; pace integer; label text;
begin
 if payload->>'action' is distinct from 'group-edit' then
  perform public.write_tracking_race_before_group_edit(target_race,payload);return;
 end if;
 if not public.is_tracking_admin() or not public.can_register_tracking_entry() then raise exception 'RACE_FORBIDDEN'; end if;
 select coalesce(parent_race_id,race_id) into root from tracking_races where race_id=target_race and status='active';
 if root is null then raise exception 'RACE_NOT_FOUND'; end if;
 perform 1 from tracking_races where race_id=root and status='active' for update;
 if not found then raise exception 'RACE_NOT_FOUND'; end if;
 destination:=(payload->>'courseId')::uuid;gid:=(payload->>'groupId')::uuid;
 perform 1 from tracking_races where race_id=destination and coalesce(parent_race_id,race_id)=root and status='active' for update;
 if not found then raise exception 'INVALID_COURSE'; end if;
 if jsonb_typeof(payload->'name') is distinct from 'string' or jsonb_typeof(payload->'paceSeconds') is distinct from 'number' then raise exception 'INVALID_GROUP'; end if;
 label:=trim(payload->>'name');
 if length(label) not between 1 and 40 or label ~ '[[:cntrl:]]' then raise exception 'INVALID_GROUP'; end if;
 if (payload->>'paceSeconds')::numeric<>trunc((payload->>'paceSeconds')::numeric) then raise exception 'INVALID_GROUP'; end if;
 pace:=(payload->>'paceSeconds')::integer;
 if pace not between 120 and 1200 then raise exception 'INVALID_GROUP'; end if;
 update tracking_pace_groups set name=label,pace_seconds=pace where group_id=gid and race_id=destination;
 if not found then raise exception 'GROUP_NOT_FOUND'; end if;
 -- Update the prediction baseline, preserving every measured checkpoint and assignment.
 update tracking_race_entries set target_pace_seconds=pace,updated_at=now()
 where race_id=destination and group_id=gid and deleted_at is null;
end $$;
revoke all on function public.write_tracking_race(uuid,jsonb) from public,anon;
grant execute on function public.write_tracking_race(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
