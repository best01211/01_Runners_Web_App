import {PGlite} from '../.test-output/sql-qa/node_modules/@electric-sql/pglite/dist/index.js';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
await db.exec(read('./test-release-database.mjs').match(/await db\.exec\(`([\s\S]*?)`\);/)[1]);
await db.exec(read('./test-stabilization-database.mjs').match(/await db\.exec\(`([\s\S]*?)`\);/)[1]);
await db.exec(`create type schedule_status as enum('draft','open','closed','in_progress','completed','cancelled');alter table schedules alter column status type schedule_status using status::schedule_status;
create table race_entries(entry_id uuid primary key,schedule_id uuid,user_id uuid);create table tracking_races(race_id uuid primary key,status text);create table tracking_race_entries(entry_id uuid primary key,race_id uuid,user_id uuid);`);
for(const name of ['003_member_approval','008_release_fixes','009_product_stabilization','012_operational_enum_compatibility','016_restricted_member_access'])await db.exec(read('../supabase/migrations/'+name+'.sql'));
await db.exec(read('../supabase/migrations/016_restricted_member_access.sql'));
const admin='11111111-1111-4111-8111-111111111111',member='22222222-2222-4222-8222-222222222222',staff='33333333-3333-4333-8333-333333333333',run='44444444-4444-4444-8444-444444444444',second='55555555-5555-4555-8555-555555555555',group='66666666-6666-4666-8666-666666666666';
await db.query("insert into profiles(user_id,role,account_status,approval_status,login_id,name) values($1,'admin','active','approved','admin','Admin'),($2,'member','active','approved','member','Member'),($3,'staff','active','approved','staff','Staff')",[admin,member,staff]);
await db.query("insert into schedules(schedule_id,schedule_type,status,creator_id) values($1,'regular','open',$3),($2,'regular','open',$3)",[run,second,admin]);
await db.query('insert into pace_groups(pace_group_id,schedule_id) values($1,$2)',[group,run]);
const actor=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);};
let passed=1;const check=(a,b)=>{assert.deepEqual(a,b);passed++};const deny=async(fn,re)=>{await assert.rejects(fn,re);passed++};
await actor(member);await db.query('select register_schedule_participation_with_group($1,$2)',[run,group]);
await actor(staff);await db.query('select register_schedule_participation_with_group($1,$2)',[run,group]);
await db.query("update profiles set account_status='restricted' where user_id in ($1,$2)",[member,staff]);
for(const id of [member,staff]){
 await actor(id);check((await db.query('select can_read_member() value')).rows[0].value,true);check((await db.query('select is_active_member() value')).rows[0].value,false);
 await deny(()=>db.query('select register_schedule_participation_with_group($1,null)',[second]),/PARTICIPATION_FORBIDDEN/);
 await deny(()=>db.query('select change_participation_group($1,$2)',[run,group]),/PARTICIPATION_FORBIDDEN/);
 await deny(()=>db.query("select write_attendance($1,'{\"action\":\"open\"}')",[run]),/FORBIDDEN/);
 await db.query("select update_own_profile('{\"nickname\":\"updated\"}')");passed++;
 // Unique nickname must not interfere with the other test user.
 await db.query('update profiles set nickname=null where user_id=$1',[id]);
}
await actor(admin);const code=(await db.query("select write_attendance($1,'{\"action\":\"open\"}') value",[run])).rows[0].value.code;
for(const id of [member,staff]){await actor(id);await db.query('select write_attendance($1,$2::jsonb)',[run,JSON.stringify({action:'check',code})]);passed++;}
await actor(staff);await deny(()=>db.query("select write_attendance($1,'{\"action\":\"close\"}')",[run]),/FORBIDDEN/);
await actor(member);await db.query("update schedules set attendance_opened_at=null where schedule_id=$1",[run]);await db.query('update schedule_participations set participation_locked=false where user_id=$1',[member]);
await db.query('select cancel_schedule_participation($1,null)',[run]);passed++;
await db.query("update profiles set account_status='suspended' where user_id=$1",[member]);check((await db.query('select can_read_member() value')).rows[0].value,false);
await deny(()=>db.query("select update_own_profile('{}')"),/FORBIDDEN/);
await db.query("update profiles set account_status='restricted' where user_id=$1",[member]);
const request=(await db.query("select request_withdrawal('test') value")).rows[0].value;
check(request.previous_account_status,'restricted');check((await db.query('select can_read_member() value')).rows[0].value,false);
await deny(()=>db.query('select cancel_schedule_participation($1,null)',[run]),/PARTICIPATION_FORBIDDEN/);
await actor(admin);await db.query("select review_withdrawal($1,'reject')",[request.request_id]);
await actor(member);check((await db.query('select can_read_member() value')).rows[0].value,true);check((await db.query('select account_status from profiles where user_id=$1',[member])).rows[0].account_status,'restricted');
await db.exec('set role authenticated');check((await db.query('select count(*)::int n from schedules')).rows[0].n,2);
await deny(()=>db.query("update schedules set status='open'"),/permission denied/);
await db.exec('reset role');await db.query("update profiles set account_status='suspended' where user_id=$1",[member]);await db.exec('set role authenticated');
check((await db.query('select count(*)::int n from schedules')).rows[0].n,0);
console.log(`Restricted access database: ${passed} checks passed`);await db.close();
