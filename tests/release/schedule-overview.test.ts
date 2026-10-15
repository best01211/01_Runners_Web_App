import assert from 'node:assert/strict';
import test from 'node:test';
import {selectUpcomingSchedules,nextMonthAt,koreaDay,monthRange,scheduleProgress,type ScheduleSummary} from '../../src/lib/schedule-overview';
const now='2026-10-15T03:00:00Z';
const make=(id:string,type:string,start='2026-10-20T00:00:00Z',extra:Partial<ScheduleSummary>={}):ScheduleSummary=>({schedule_id:id,title:id,schedule_type:type,status:'open',location:'한강공원',start_at:start,end_at:new Date(Date.parse(start)+3600000).toISOString(),registration_end_at:'2026-10-19T00:00:00Z',capacity:null,...extra});
test('upcoming selects nearest regular and training individually and all monthly event/flash runs',()=>{
 const rows=[make('r2','regular','2026-10-30T00:00:00Z'),make('r1','regular'),make('t2','training','2027-02-01T00:00:00Z'),make('t1','training','2026-12-01T00:00:00Z'),make('e1','event'),make('f1','flash'),make('far','event','2026-11-15T03:00:01Z'),make('edge','event','2026-11-15T03:00:00Z')];
 const result=selectUpcomingSchedules(rows,now);assert.deepEqual(new Set(result.map(s=>s.schedule_id)),new Set(['r1','t1','e1','f1','edge']));assert.equal(rows[0].schedule_id,'r2');
 assert(!selectUpcomingSchedules(rows,now,false).some(s=>s.schedule_type==='flash'));
});
test('upcoming omits completed, cancelled and elapsed schedules while preserving running schedules',()=>{
 const rows=[make('done','regular',undefined,{status:'completed'}),make('cancel','regular',undefined,{status:'cancelled'}),make('old','training','2026-10-14T00:00:00Z'),make('running','regular','2026-10-15T02:30:00Z'),make('next','regular','2026-10-16T00:00:00Z')];
 assert.deepEqual(selectUpcomingSchedules(rows,now).map(s=>s.schedule_id),['running']);
 assert.equal(scheduleProgress(rows[0],now),'종료');assert.equal(scheduleProgress(rows[1],now),'취소');assert.equal(scheduleProgress(rows[2],now),'종료');assert.equal(scheduleProgress(rows[3],now),'진행 중');assert.equal(scheduleProgress(rows[4],now),'시작 전');
});
test('one-month windows clamp month-end and use the Korean calendar across UTC boundaries',()=>{
 assert.equal(nextMonthAt('2026-01-31T03:00:00Z'),'2026-02-28T03:00:00.000Z');assert.equal(nextMonthAt('2028-01-31T03:00:00Z'),'2028-02-29T03:00:00.000Z');
 assert.equal(nextMonthAt('2026-12-31T03:00:00Z'),'2027-01-31T03:00:00.000Z');assert.equal(koreaDay('2026-10-31T16:00:00Z'),'2026-11-01');
 assert.deepEqual(monthRange('2026-11'),{start:'2026-10-31T15:00:00.000Z',end:'2026-11-30T15:00:00.000Z'});
});
test('monthly events are not subject to the former three-card or a fixed item count limit',()=>{
 const rows=Array.from({length:1200},(_,i)=>make(String(i),'event'));assert.equal(selectUpcomingSchedules(rows,now).length,1200);
});
