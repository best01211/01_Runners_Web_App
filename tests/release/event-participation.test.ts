import assert from 'node:assert/strict';import test from 'node:test';
import {validateSchedulePayload} from '../../src/lib/validation/schedule';
import {requestFeature} from '../../src/lib/service-policy';
const base={title:'가을 이벤트',location:'서울 한강',scheduleType:'event',startAt:'2026-10-25T09:00',endAt:'2026-10-25T12:00',registrationStartAt:'2026-10-15T09:00',registrationEndAt:'2026-10-24T18:00'};
test('race events use unlimited capacity and gathering events require first-come capacity and a start date',()=>{
 const race=validateSchedulePayload({...base,eventKind:'race',capacity:1,staffInCapacity:false}).value;assert(race);assert.equal(race.capacity,null);assert.equal(race.event_kind,'race');assert.equal(race.staff_in_capacity,true);
 const gathering=validateSchedulePayload({...base,eventKind:'gathering',capacity:2}).value;assert(gathering);assert.equal(gathering.capacity,2);assert.equal(gathering.event_kind,'gathering');
 for(const extra of [{eventKind:'bad'},{eventKind:'gathering'},{eventKind:'gathering',capacity:0},{eventKind:'gathering',capacity:1.5},{eventKind:'race',registrationStartAt:''}])assert(validateSchedulePayload({...base,...extra}).error);
 assert(!('event_kind' in validateSchedulePayload({...base,scheduleType:'flash',eventKind:'race'}).value!));
});
test('event application and manager additions use the same maintenance restriction as normal participation',()=>{
 for(const method of ['POST','PATCH'])assert.equal(requestFeature('/api/schedules/test/event-participation',method),'participation');
 assert.equal(requestFeature('/api/schedules/test/event-participation','GET'),null);assert.equal(requestFeature('/api/schedules/test/participation','DELETE'),null);
});
