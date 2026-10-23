import assert from "node:assert/strict";
import test from "node:test";
import { parseRegularTemplate } from "../../src/lib/regular-run-templates";
import { validateSchedulePayload } from "../../src/lib/validation/schedule";

test("regular templates validate names, locations, description and capacity", () => {
  assert.deepEqual(parseRegularTemplate({ name: " 화요런 ", location: " 잠실 ", description: " 설명 ", capacity: "60" }), { name: "화요런", location: "잠실", description: "설명", capacity: 60, pace_groups: [] });
  assert.equal(parseRegularTemplate({ name: "정기런", location: "잠실", capacity: "" })?.capacity, null);
  for (const override of [{name:""},{name:"a".repeat(101)},{location:""},{description:"a".repeat(10001)},{capacity:0},{capacity:1.5},{capacity:100001},{capacity:"invalid"}]) assert.equal(parseRegularTemplate({ name: "정기런", location: "잠실", ...override }), null);
});
test("only regular schedules retain valid template references", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const body = { title:"정기런",location:"잠실",startAt:"2026-10-13T19:00",endAt:"2026-10-13T20:00",registrationEndAt:"2026-10-13T18:00",registrationStartAt:"2026-10-12T09:00",eventKind:"race" };
  assert.equal(validateSchedulePayload({...body,scheduleType:"regular",regularTemplateId:id}).value?.regular_template_id,id);
  assert.ok(validateSchedulePayload({...body,scheduleType:"regular",regularTemplateId:"invalid"}).error);
  for (const scheduleType of ["flash","event","training"]) assert.equal(validateSchedulePayload({...body,scheduleType,regularTemplateId:id}).value?.regular_template_id,null);
});
test("template pace groups reject duplicates, malformed values and off-step pace/distance", () => {
  const base={name:"정기런",location:"잠실"};
  assert.deepEqual(parseRegularTemplate({...base,paceGroups:[{paceSeconds:330,distanceKm:10}]})?.pace_groups,[{paceSeconds:330,distanceKm:10}]);
  for(const paceGroups of ["bad",[null],[{paceSeconds:"330",distanceKm:10}],[{paceSeconds:331,distanceKm:10}],[{paceSeconds:330,distanceKm:6.5}],[{paceSeconds:330,distanceKm:10},{paceSeconds:330,distanceKm:10}],Array(21).fill({paceSeconds:330,distanceKm:10})]) assert.equal(parseRegularTemplate({...base,paceGroups}),null);
});

 test("6km and other integer distances above the minimum are accepted",()=>{
  for(const distanceKm of [5,6,7,11])assert.deepEqual(parseRegularTemplate({name:"정기런",location:"잠실",paceGroups:[{paceSeconds:330,distanceKm}]})?.pace_groups,[{paceSeconds:330,distanceKm}]);
  for(const distanceKm of [0,4,5.5,NaN,Infinity])assert.equal(parseRegularTemplate({name:"정기런",location:"잠실",paceGroups:[{paceSeconds:330,distanceKm}]}),null);
 });
