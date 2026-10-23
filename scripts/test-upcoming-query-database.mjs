import {PGlite} from "../.test-output/sql-qa/node_modules/@electric-sql/pglite/dist/index.js";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import Module from "node:module";
import assert from "node:assert/strict";
import ts from "typescript";
const require=createRequire(import.meta.url),compiled=new Module("schedule-overview");
compiled.require=require;compiled._compile(ts.transpileModule(readFileSync("src/lib/schedule-overview.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,"schedule-overview");
const {selectUpcomingSchedules,nextMonthAt}=compiled.exports;
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;
create type run_type as enum('regular','training','event','flash');
create type run_status as enum('open','in_progress','completed','cancelled');
create table schedules(schedule_id uuid primary key default gen_random_uuid(),title text,schedule_type run_type,status run_status,location text,start_at timestamptz,end_at timestamptz,registration_end_at timestamptz,capacity integer,deleted_at timestamptz);
grant select on schedules to service_role;`);
const migration=readFileSync('supabase/migrations/026_upcoming_schedule_query.sql','utf8');await db.exec(migration);await db.exec(migration);
const now='2026-01-31T10:00:00.000Z',until=nextMonthAt(now);
for(const [type,offset,status,deleted] of [['regular',2,'open',false],['regular',3,'open',false],['training',-1,'in_progress',false],['training',3,'open',false],['event',1,'open',false],['flash',3,'open',false],['event',60,'open',false],['event',1,'cancelled',false],['regular',1,'completed',false],['training',1,'open',true]]){
 const start=new Date(Date.parse(now)+offset*86400000),end=new Date(Date.parse(now)+(offset===-1?1:offset+1)*86400000);
 await db.query("insert into schedules(title,schedule_type,status,location,start_at,end_at,registration_end_at,capacity,deleted_at) values($1,$2,$3,'잠실',$4,$5,$4,50,$6)",[type+'-'+offset+'-'+status,type,status,start.toISOString(),end.toISOString(),deleted?now:null]);
}
await db.query("insert into schedules(title,schedule_type,status,location,start_at,end_at,registration_end_at) select 'bulk-'||i,'event','open','잠실',$1::timestamptz,$1::timestamptz+interval '1 day',$1::timestamptz from generate_series(1,1001) i",[until]);
const rows=(await db.query('select * from schedules')).rows.map(row=>({...row,start_at:row.start_at.toISOString(),end_at:row.end_at.toISOString(),registration_end_at:row.registration_end_at.toISOString()}));
let checks=0;
for(const includeFlash of [true,false]){
 const expected=selectUpcomingSchedules(rows.filter(row=>!row.deleted_at),now,includeFlash).map(row=>row.schedule_id);
 const result=(await db.query('select * from get_upcoming_schedule_summaries($1,$2,$3)',[now,until,includeFlash])).rows;
 assert.deepEqual(result.map(row=>row.schedule_id),expected);checks++;
 assert.ok(result.length>1000);checks++;
}
await db.exec('set role authenticated');await assert.rejects(()=>db.query('select * from get_upcoming_schedule_summaries($1,$2,true)',[now,until]),/permission denied/);checks++;
await db.exec('reset role;set role service_role');assert.ok((await db.query('select * from get_upcoming_schedule_summaries($1,$2,true)',[now,until])).rows.length>1000);checks++;
console.log(`Upcoming query database: ${checks} checks passed, including month-end boundaries, nearest schedules, cancelled/deleted exclusion and 1001+ events`);await db.close();
