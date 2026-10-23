-- One RPC/transaction for all courses. Any invalid course rolls back the event.
begin;
create function public.create_tracking_event(payload jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare root uuid; first_id uuid; item jsonb; request jsonb;
begin
 if not public.is_tracking_admin() then raise exception 'RACE_FORBIDDEN'; end if;
 if jsonb_typeof(payload->'courses') is distinct from 'array' then raise exception 'INVALID_COURSE'; end if;
 if jsonb_array_length(payload->'courses') not between 1 and 20 then raise exception 'COURSE_LIMIT'; end if;
 if exists(select 1 from jsonb_array_elements(payload->'courses') c
  where jsonb_typeof(c->'courseName') is distinct from 'string' or length(trim(c->>'courseName')) not between 1 and 60) then raise exception 'INVALID_COURSE'; end if;
 if exists(select 1 from jsonb_array_elements(payload->'courses') c group by trim(c->>'courseName') having count(*)>1) then raise exception 'DUPLICATE_COURSE'; end if;
 root:=(payload->>'parentRaceId')::uuid;
 for item in select value from jsonb_array_elements(payload->'courses') loop
  request:=(item-'parentRaceId')||jsonb_build_object('name',payload->>'name','location',coalesce(payload->>'location',''));
  if root is not null then request:=request||jsonb_build_object('parentRaceId',root); end if;
  first_id:=public.create_tracking_race(request);
  if root is null then root:=first_id; end if;
 end loop;
 return root;
end; $$;
revoke all on function public.create_tracking_event(jsonb) from public,anon;
grant execute on function public.create_tracking_event(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
