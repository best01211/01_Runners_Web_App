import assert from "node:assert/strict";
import test from "node:test";
import {participationGroupLabel,canSelectParticipationGroup,type ParticipationGroup} from "../../src/lib/participation-groups";
const base:ParticipationGroup={pace_group_id:"id",pace_seconds:330,distance_km:6};
test("support options preserve running labels and identify their purpose",()=>{
 assert.equal(participationGroupLabel(base),"5:30 / 6km");
 assert.equal(participationGroupLabel({...base,group_kind:"storage"}),"짐보관");
 assert.equal(participationGroupLabel({...base,group_kind:"photo"}),"포토");
});
test("storage is staff-only while photo remains available to members",()=>{
 assert.equal(canSelectParticipationGroup({...base,group_kind:"storage"},false),false);
 assert.equal(canSelectParticipationGroup({...base,group_kind:"storage"},true),true);
 assert.equal(canSelectParticipationGroup({...base,group_kind:"photo"},false),true);
 assert.equal(canSelectParticipationGroup(base,false),true);
});
