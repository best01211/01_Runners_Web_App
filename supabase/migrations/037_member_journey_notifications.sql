begin;
create table if not exists public.member_notifications(
 notification_id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(user_id) on delete cascade,
 schedule_id uuid not null references public.schedules(schedule_id) on delete cascade,
 comment_id uuid references public.comments(comment_id) on delete cascade,
 kind text not null check(kind in ('schedule_changed','schedule_cancelled','comment_reply','comment_notice')),
 title text not null,
 message text not null,
 created_at timestamptz not null default now(),
 read_at timestamptz
);
create index if not exists member_notifications_inbox on public.member_notifications(user_id,created_at desc,notification_id);
alter table public.member_notifications enable row level security;
drop policy if exists member_notifications_self on public.member_notifications;
create policy member_notifications_self on public.member_notifications for select to authenticated using(user_id=auth.uid() and public.can_read_member());
revoke all on public.member_notifications from public,anon,authenticated;
grant select on public.member_notifications to authenticated;
grant all on public.member_notifications to service_role;

create or replace function public.notify_member_schedule_change() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare changed text[]:='{}'; notice text; cancelled boolean;
begin
 if old.deleted_at is not null then return new;end if;
 cancelled:=new.status::text='cancelled' or new.deleted_at is not null;
 if new.start_at is distinct from old.start_at then changed:=array_append(changed,'시작: '||to_char(old.start_at at time zone 'Asia/Seoul','MM/DD HH24:MI')||' → '||to_char(new.start_at at time zone 'Asia/Seoul','MM/DD HH24:MI'));end if;
 if new.end_at is distinct from old.end_at then changed:=array_append(changed,'종료 시각 변경');end if;
 if new.location is distinct from old.location then changed:=array_append(changed,'장소: '||coalesce(old.location,'미정')||' → '||coalesce(new.location,'미정'));end if;
 if new.title is distinct from old.title then changed:=array_append(changed,'제목: '||old.title||' → '||new.title);end if;
 if new.description is distinct from old.description then changed:=array_append(changed,'상세 안내 변경');end if;
 if new.registration_end_at is distinct from old.registration_end_at then changed:=array_append(changed,'신청 마감 변경');end if;
 if new.cancellation_deadline_at is distinct from old.cancellation_deadline_at then changed:=array_append(changed,'취소 기한 변경');end if;
 if not cancelled and cardinality(changed)=0 then return new;end if;
 if cancelled and old.status::text='cancelled' and new.deleted_at is null then return new;end if;
 notice:=case when cancelled then '신청한 일정이 취소되었습니다.' else array_to_string(changed,' / ') end;
 insert into public.member_notifications(user_id,schedule_id,kind,title,message)
 select distinct p.user_id,new.schedule_id,case when cancelled then 'schedule_cancelled' else 'schedule_changed' end,new.title,left(notice,2000)
 from public.schedule_participations p where p.schedule_id=new.schedule_id and p.status::text in ('registered','completed') and p.user_id is not null and p.user_id is distinct from auth.uid();
 return new;
end;$$;
drop trigger if exists schedules_member_notifications on public.schedules;
create trigger schedules_member_notifications after update on public.schedules for each row execute function public.notify_member_schedule_change();

create or replace function public.notify_member_comment() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare recipient uuid; schedule_title text;
begin
 if new.deleted_at is not null then return new;end if;
 if tg_op='UPDATE' and (old.kind is not distinct from new.kind or new.kind::text<>'notice') then return new;end if;
 select title into schedule_title from public.schedules where schedule_id=new.schedule_id and deleted_at is null;
 if not found then return new;end if;
 if new.parent_comment_id is not null and tg_op='INSERT' then
  select author_id into recipient from public.comments where comment_id=new.parent_comment_id and schedule_id=new.schedule_id;
  if recipient is not null and recipient is distinct from new.author_id then
   insert into public.member_notifications(user_id,schedule_id,comment_id,kind,title,message) values(recipient,new.schedule_id,new.comment_id,'comment_reply',schedule_title,'내 댓글에 답글이 등록되었습니다.');
  end if;
 elsif new.kind::text='notice' then
  insert into public.member_notifications(user_id,schedule_id,comment_id,kind,title,message)
  select distinct p.user_id,new.schedule_id,new.comment_id,'comment_notice',schedule_title,'신청한 일정에 새 공지가 등록되었습니다.' from public.schedule_participations p
   where p.schedule_id=new.schedule_id and p.status::text in ('registered','completed') and p.user_id is not null and p.user_id is distinct from new.author_id;
 end if;
 return new;
end;$$;
drop trigger if exists comments_member_notifications on public.comments;
create trigger comments_member_notifications after insert or update of kind on public.comments for each row execute function public.notify_member_comment();
revoke all on function public.notify_member_schedule_change(),public.notify_member_comment() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
