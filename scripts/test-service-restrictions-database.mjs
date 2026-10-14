import {PGlite} from '../.test-output/sql-qa/node_modules/@electric-sql/pglite/dist/index.js';import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
const db=new PGlite();const read=n=>readFileSync(new URL(n,import.meta.url),'utf8');
await db.exec(read('./test-release-database.mjs').match(/await db\.exec\(`([\s\S]*?)`\);/)[1]);await db.exec(read('./test-stabilization-database.mjs').match(/await db\.exec\(`([\s\S]*?)`\);/)[1]);
await db.exec(`create type schedule_status as enum('draft','open','closed','in_progress','completed','cancelled');alter table schedules alter column status type schedule_status using status::schedule_status;
create table race_entries(entry_id uuid,schedule_id uuid,user_id uuid);create table tracking_races(race_id uuid,status text);create table tracking_race_entries(entry_id uuid,race_id uuid,user_id uuid);
create table system_settings(setting_key text primary key,setting_value jsonb);alter table comments add column kind text default 'normal';`);
for(const n of ['003_member_approval','008_release_fixes','009_product_stabilization','012_operational_enum_compatibility','016_restricted_member_access','017_service_feature_restrictions'])await db.exec(read('../supabase/migrations/'+n+'.sql'));
await db.exec(read('../supabase/migrations/017_service_feature_restrictions.sql'));
const admin='11111111-1111-4111-8111-111111111111',otherAdmin='22222222-2222-4222-8222-222222222222',staff='33333333-3333-4333-8333-333333333333',member='44444444-4444-4444-8444-444444444444',pacer='55555555-5555-4555-8555-555555555555',run='66666666-6666-4666-8666-666666666666',group='77777777-7777-4777-8777-777777777777';
for(const [id,role,flag] of [[admin,'admin',false],[otherAdmin,'admin',false],[staff,'staff',false],[member,'member',false],[pacer,'member',true]])await db.query("insert into profiles(user_id,role,account_status,approval_status,login_id,name,is_pacer) values($1::uuid,$2,'active','approved',($1::uuid)::text,'Person',$3)",[id,role,flag]);
let passed=1;const check=(a,b)=>{assert.deepEqual(a,b);passed++};const deny=async(fn,re)=>{await assert.rejects(fn,re);passed++};
const actor=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
const setting=value=>db.query("insert into system_settings values('maintenance',$1::jsonb) on conflict(setting_key) do update set setting_value=excluded.setting_value",[JSON.stringify(value)]);
await setting({status:'normal'});await actor(admin);
await db.query("insert into schedules(schedule_id,schedule_type,creator_id,status) values($1,'regular',$2,'open')",[run,staff]);await db.query('insert into pace_groups(pace_group_id,schedule_id) values($1,$2)',[group,run]);
await actor(member);await db.query('select register_schedule_participation_with_group($1,$2)',[run,group]);
await setting({status:'maintenance'});
for(const [id,expected] of [[admin,true],[staff,true],[member,false],[pacer,false]]){await actor(id);check((await db.query('select can_read_member() value')).rows[0].value,expected);}
await setting({status:'restricted',blocked:{access:true},allowedAccess:{staff:false,pacer:true,member:false,guest:false}});
for(const [id,expected] of [[admin,true],[staff,false],[member,false],[pacer,true]]){await actor(id);check((await db.query('select can_read_member() value')).rows[0].value,expected);}
// A blocked member cannot read settings through RLS. The server must use its
// privileged client rather than interpreting a hidden row as normal mode.
await db.exec("alter table system_settings enable row level security; grant select on system_settings to authenticated; create policy settings_test_read on system_settings for select to authenticated using(public.can_read_member());");
await actor(member);await db.exec('set role authenticated');
check((await db.query("select * from system_settings where setting_key='maintenance'")).rows.length,0);
await db.exec('reset role');
check((await db.query("select setting_value->>'status' value from system_settings where setting_key='maintenance'")).rows[0].value,'restricted');
await actor(staff);await deny(()=>db.query("select manage_member($1,'{\"role\":\"guest\"}')",[member]),/FORBIDDEN/);
await setting({status:'restricted',blocked:{access:false,scheduleCreation:true,comments:true,participation:true,profile:true}});await actor(admin);
await deny(()=>db.query("insert into schedules(schedule_id,schedule_type,creator_id,status) values(gen_random_uuid(),'regular',$1,'open')",[admin]),/SERVICE_FEATURE_BLOCKED/);
await deny(()=>db.query("insert into comments(author_id,content,kind) values($1,'hello','normal')",[member]),/SERVICE_FEATURE_BLOCKED/);
await actor(member);await deny(()=>db.query('select register_schedule_participation_with_group($1,$2)',[run,group]),/SERVICE_FEATURE_BLOCKED/);await deny(()=>db.query('select change_participation_group($1,$2)',[run,group]),/SERVICE_FEATURE_BLOCKED/);
await deny(()=>db.query("select update_own_profile('{\"nickname\":\"test\"}')"),/SERVICE_FEATURE_BLOCKED/);
await actor(staff);const code=(await db.query("select write_attendance($1,'{\"action\":\"open\"}') value",[run])).rows[0].value.code;
check((await db.query('select status from schedules where schedule_id=$1',[run])).rows[0].status,'in_progress');
await actor(member);await db.query('select write_attendance($1,$2::jsonb)',[run,JSON.stringify({action:'check',code})]);passed++;
await actor(admin);await deny(()=>db.query("select manage_member($1,'{\"role\":\"member\"}')",[otherAdmin]),/ADMIN_ROLE_PROTECTED/);
await deny(()=>db.query("update profiles set role='guest' where user_id=$1",[admin]),/ADMIN_ROLE_PROTECTED/);
await db.query("select manage_member($1,'{\"is_pacer\":true}')",[member]);check((await db.query('select is_pacer from profiles where user_id=$1',[member])).rows[0].is_pacer,true);
await actor(staff);await deny(()=>db.query("select manage_member($1,'{\"is_pacer\":false}')",[member]),/FORBIDDEN/);
await setting({status:'normal'});await actor(member);await db.query("select update_own_profile('{\"nickname\":\"restored\"}')");passed++;
console.log(`Service restrictions database: ${passed} checks passed`);await db.close();
