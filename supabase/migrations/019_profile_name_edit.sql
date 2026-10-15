-- Apply after 018. Members may edit their own real name after acknowledging the warning.
begin;
create or replace function public.update_own_profile(payload jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare actor profiles; new_name text;
begin
 perform public.assert_service_feature('profile');
 if not public.can_read_member() then raise exception 'FORBIDDEN'; end if;
 if jsonb_typeof(payload) is distinct from 'object' then raise exception 'INVALID_PROFILE'; end if;
 if exists(select 1 from jsonb_object_keys(payload) k where k not in ('name','name_warning_confirmed','phone','nickname','profile_image_url')) then raise exception 'INVALID_PROFILE'; end if;
 select * into actor from profiles where user_id=auth.uid() for update;
 if actor.user_id is null then raise exception 'FORBIDDEN'; end if;
 new_name:=actor.name;
 if payload ? 'name' then
  if jsonb_typeof(payload->'name') is distinct from 'string' then raise exception 'INVALID_NAME'; end if;
  new_name:=btrim(payload->>'name');
  if length(new_name)<2 or length(new_name)>50 or new_name ~ '[[:cntrl:]]' then raise exception 'INVALID_NAME'; end if;
  if new_name is distinct from actor.name and payload->'name_warning_confirmed' is distinct from 'true'::jsonb then raise exception 'NAME_CONFIRMATION_REQUIRED'; end if;
 end if;
 if length(coalesce(payload->>'phone',''))>30 or length(coalesce(payload->>'nickname',''))>50 then raise exception 'INVALID_PROFILE'; end if;
 update profiles set name=new_name,
  phone=case when payload ? 'phone' then nullif(payload->>'phone','') else actor.phone end,
  nickname=case when payload ? 'nickname' then nullif(payload->>'nickname','') else actor.nickname end,
  profile_image_url=case when payload ? 'profile_image_url' then nullif(payload->>'profile_image_url','') else actor.profile_image_url end
 where user_id=auth.uid();
end $$;
revoke all on function public.update_own_profile(jsonb) from public,anon;
grant execute on function public.update_own_profile(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
