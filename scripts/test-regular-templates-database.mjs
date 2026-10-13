import { PGlite } from '../.test-output/sql-qa/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table profiles(user_id uuid primary key,role text,account_status text,approval_status text);
create table schedules(schedule_id uuid primary key default gen_random_uuid(),schedule_type text,deleted_at timestamptz,image_url text,course_image_url text,title text);
create function is_active_member() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from profiles where user_id=auth.uid() and account_status='active' and approval_status='approved' and role in ('guest','member','staff','admin'))$$;
alter table schedules enable row level security;
create policy schedules_read on schedules for select to authenticated using(is_active_member());
grant select(schedule_id,schedule_type,deleted_at,title) on schedules to authenticated;
grant all on schedules to service_role;
`);
const sql = readFileSync(new URL('../supabase/migrations/010_regular_run_templates.sql',import.meta.url),'utf8');
await db.exec(sql);
await db.exec(sql); // Explicitly safe to reapply.
let passed = 1;
const check = (actual, expected) => { assert.deepEqual(actual,expected); passed++; };
const denies = async (fn, pattern) => { await assert.rejects(fn,pattern); passed++; };
const admin='11111111-1111-4111-8111-111111111111',staff='22222222-2222-4222-8222-222222222222',member='33333333-3333-4333-8333-333333333333',inactive='44444444-4444-4444-8444-444444444444';
for (const [id,role,status] of [[admin,'admin','active'],[staff,'staff','active'],[member,'member','active'],[inactive,'staff','suspended']]) await db.query("insert into profiles values($1,$2,$3,'approved')",[id,role,status]);
const actor = async id => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); await db.exec('set role authenticated'); };
await db.exec('set role service_role');
const create = async name => (await db.query("insert into regular_run_templates(name,location) values($1,'잠실') returning template_id",[name])).rows[0].template_id;
const ids = [];
for (let i=0;i<4;i++) ids.push(await create('정기런 '+(i+1)));
check((await db.query('select count(*)::int n from regular_run_templates')).rows[0].n,4);
await db.query("update regular_run_templates set image_url='https://example.test/run.webp' where template_id=$1",[ids[0]]);passed++;
const schedule=(await db.query("insert into schedules(schedule_type,regular_template_id,title,image_url,course_image_url) values('regular',$1,'첫 일정','ignored','ignored') returning *",[ids[0]])).rows[0];
check(schedule.regular_template_id,ids[0]);check(schedule.image_url,null);check(schedule.course_image_url,null);
const flash=(await db.query("insert into schedules(schedule_type,regular_template_id) values('flash',$1) returning regular_template_id",[ids[0]])).rows[0];
check(flash.regular_template_id,null);
await db.query('update regular_run_templates set deleted_at=now() where template_id=$1',[ids[0]]);passed++;
await denies(()=>db.query("insert into schedules(schedule_type,regular_template_id) values('regular',$1)",[ids[0]]),/정기런 양식/);
await db.query("update schedules set title='일정 수정' where schedule_id=$1",[schedule.schedule_id]);passed++;
check((await db.query('select regular_template_id from schedules where schedule_id=$1',[schedule.schedule_id])).rows[0].regular_template_id,ids[0]);
const other=(await db.query("insert into schedules(schedule_type,title) values('regular','기존 일정') returning schedule_id")).rows[0].schedule_id;
await denies(()=>db.query('update schedules set regular_template_id=$1 where schedule_id=$2',[ids[0],other]),/정기런 양식/);
await denies(()=>db.query('delete from regular_run_templates where template_id=$1',[ids[0]]),/foreign key/);
await db.query('update regular_run_templates set deleted_at=now() where template_id=$1',[ids[1]]);
for (const id of [admin,staff,member]) {
  await actor(id);
  check((await db.query('select count(*)::int n from regular_run_templates')).rows[0].n,3); // 2 active plus referenced retired.
  await denies(()=>db.query("insert into regular_run_templates(name,location) values('우회','잠실')"),/permission denied/);
  await denies(()=>db.query("update regular_run_templates set name='우회'"),/permission denied/);
  await denies(()=>db.query('delete from regular_run_templates'),/permission denied/);
}
await actor(inactive);check((await db.query('select count(*)::int n from regular_run_templates')).rows[0].n,0);
await db.exec('reset role;set role anon');await denies(()=>db.query('select * from regular_run_templates'),/permission denied/);
await db.exec('reset role');
check((await db.query('select count(*)::int n from schedules')).rows[0].n,3);
console.log(`Regular templates database: ${passed} checks passed`);
await db.close();
