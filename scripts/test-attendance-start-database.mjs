import {PGlite} from '../.test-output/sql-qa/node_modules/@electric-sql/pglite/dist/index.js';import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
const db=new PGlite();const read=n=>readFileSync(new URL(n,import.meta.url),'utf8');
await db.exec(read('./test-release-database.mjs').match(/await db\.exec\(`([\s\S]*?)`\);/)[1]);await db.exec(read('./test-stabilization-database.mjs').match(/await db\.exec\(`([\s\S]*?)`\);/)[1]);
await db.exec(`create type schedule_status as enum('draft','open','closed','in_progress','completed','cancelled');alter table schedules alter column status type schedule_status using status::schedule_status;
create table race_entries(entry_id uuid,schedule_id uuid,user_id uuid);create table tracking_races(race_id uuid,status text);create table tracking_race_entries(entry_id uuid,race_id uuid,user_id uuid);
create table system_settings(setting_key text primary key,setting_value jsonb);alter table comments add column kind text default 'normal';`);
for(const n of ['003_member_approval','008_release_fixes','009_product_stabilization','012_operational_enum_compatibility','016_restricted_member_access','017_service_feature_restrictions'])await db.exec(read('../supabase/migrations/'+n+'.sql'));
await db.exec(read('../supabase/migrations/017_service_feature_restrictions.sql'));

await db.exec(`
alter table pace_groups add column created_by uuid references profiles;
alter table pace_groups alter column pace_seconds set not null;
alter table pace_groups alter column distance_km set not null;
alter table pace_groups add constraint pace_groups_pace_seconds_check check(pace_seconds>0 and pace_seconds%30=0);
alter table pace_groups add constraint pace_groups_distance_km_check check(distance_km>=5 and distance_km%5=0);
alter table pace_groups add constraint pace_groups_schedule_id_pace_seconds_distance_km_key unique(schedule_id,pace_seconds,distance_km);
alter table schedules add column regular_template_id uuid;
create table regular_run_templates(template_id uuid primary key default gen_random_uuid(),deleted_at timestamptz);
alter table attendances add column updated_at timestamptz;
`);
for(const n of ['013_unify_participation_pace_groups','014_regular_template_pace_groups','015_schedule_creation_pace_groups','020_four_digit_attendance'])await db.exec(read('../supabase/migrations/'+n+'.sql'));

await db.exec(`alter table schedules add column end_at timestamptz default now()+interval '1 day',add column event_kind text;
create table race_courses(schedule_id uuid primary key references schedules on delete restrict);
alter table race_entries add constraint test_race_course_fk foreign key(schedule_id) references race_courses;
alter table race_entries add primary key(entry_id);
create table runner_checkpoints(checkpoint_id uuid primary key,entry_id uuid references race_entries(entry_id));
`);

const authority=read('../supabase/migrations/018_executive_permissions.sql');
await db.exec(authority.slice(authority.indexOf('create or replace function public.can_administer'),authority.indexOf('revoke all on function public.can_administer')));
await db.exec(read('../supabase/migrations/024_regular_support_groups.sql'));
// Add the actual ownership FKs omitted by the legacy lightweight test fixture.
await db.exec(`alter table pace_groups add foreign key(schedule_id) references schedules on delete cascade;
alter table schedule_participations add foreign key(schedule_id) references schedules;
alter table attendances add foreign key(schedule_id) references schedules;
alter table comments add column schedule_id uuid references schedules;
`);
await db.exec('create role service_role');
const migration=read('../supabase/migrations/025_schedule_admin_controls.sql');await db.exec(migration);await db.exec(migration);
const admin='11111111-1111-4111-8111-111111111111',staff='22222222-2222-4222-8222-222222222222',member='33333333-3333-4333-8333-333333333333',secondAdmin='44444444-4444-4444-8444-444444444444',run='55555555-5555-4555-8555-555555555555',neighbor='66666666-6666-4666-8666-666666666666';
for(const [id,role] of [[admin,'admin'],[staff,'staff'],[member,'member'],[secondAdmin,'admin']])await db.query("insert into profiles(user_id,role,account_status,approval_status,login_id,name) values($1::uuid,$2,'active','approved',($1::uuid)::text,'Person')",[id,role]);
await db.query("insert into schedules(schedule_id,schedule_type,creator_id,status) values($1,'regular',$3,'open'),($2,'regular',$3,'open')",[run,neighbor,staff]);

await db.exec('alter table schedules add column start_at timestamptz');
await db.exec(read('../supabase/migrations/032_attendance_start_time.sql'));
let passed=0;
const actor=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
const write=payload=>db.query('select write_attendance($1,$2::jsonb)',[run,JSON.stringify(payload)]);
const deny=async fn=>{await assert.rejects(fn,/SCHEDULE_NOT_STARTED/);passed++;};
await db.query("insert into schedule_participations(schedule_id,user_id,status) values($1,$2,'registered')",[run,member]);
for(const type of ['regular','training','flash','event']){
 await actor(staff);await db.query("update schedules set schedule_type=$2,start_at=now()+interval '1 hour',attendance_opened_at=null,attendance_closed_at=null,status='open' where schedule_id=$1",[run,type]);
 for(const action of ['open','manual','close'])await deny(()=>write({action,userId:member,status:'attended'}));
 await actor(member);await deny(()=>write({action:'check',code:'1234'}));
 await actor(admin);await deny(()=>db.query('select write_admin_schedule_test($1,$2::jsonb)',[run,JSON.stringify({action:'check',code:'1234'})]));
 await actor(staff);
 // Exact boundary: the transaction's now() is also the scheduled start.
 await db.exec('begin');await db.query("update schedules set start_at=now() where schedule_id=$1",[run]);await write({action:'open'});await db.exec('commit');passed++;
 const code=(await db.query('select attendance_code from schedules where schedule_id=$1',[run])).rows[0].attendance_code;
 await actor(member);await write({action:'check',code});passed++;
 await actor(staff);await write({action:'manual',userId:member,status:'late'});await write({action:'close'});passed++;
 await db.query('delete from attendances where schedule_id=$1',[run]);
}
console.log(`Attendance start boundary: ${passed} checks passed across regular, training, flash and event schedules`);await db.close();
