import assert from "node:assert/strict";
import test from "node:test";
import {resolveRankingSeason,type RankingSeason} from "../../src/lib/ranking-seasons";

const season=(season_id:string,patch:Partial<RankingSeason>={}):RankingSeason=>({season_id,name:season_id,starts_on:"2026-10-01",ends_on:"2026-10-31",status:"active",is_default:false,is_public:true,...patch});
const now=new Date("2026-10-15T00:00:00Z");

test("ranking initially selects the current active season and puts it first",()=>{
  const result=resolveRankingSeason([season("future",{starts_on:"2026-11-01",ends_on:"2026-11-30"}),season("current"),season("old",{starts_on:"2026-09-01",ends_on:"2026-09-30",status:"closed"})],undefined,now);
  assert.equal(result.season?.season_id,"current");assert.equal(result.seasons[0].season_id,"current");
});
test("explicit all is unbounded and does not fall back to current or default",()=>{
  const seasons=[season("current"),season("baseline",{name:"기본 시즌",is_default:true})];
  for(const id of ["all","","baseline"])assert.equal(resolveRankingSeason(seasons,id,now).season,undefined);
  assert.deepEqual(resolveRankingSeason(seasons,undefined,now).seasons.map(s=>s.season_id),["current"]);
  assert.equal(resolveRankingSeason(seasons,"current",now).season?.season_id,"current");
});
test("current season uses inclusive Korea date boundaries",()=>{
  const seasons=[season("october")];
  assert.equal(resolveRankingSeason(seasons,undefined,new Date("2026-09-30T14:59:59Z")).season,undefined);
  assert.equal(resolveRankingSeason(seasons,undefined,new Date("2026-09-30T15:00:00Z")).season?.season_id,"october");
  assert.equal(resolveRankingSeason(seasons,undefined,new Date("2026-10-31T14:59:59Z")).season?.season_id,"october");
  assert.equal(resolveRankingSeason(seasons,undefined,new Date("2026-10-31T15:00:00Z")).season,undefined);
});
test("no current season falls back to all and overlapping seasons prefer the later start",()=>{
  assert.equal(resolveRankingSeason([season("closed",{status:"closed"}),season("scheduled",{status:"scheduled"})],undefined,now).season,undefined);
  assert.equal(resolveRankingSeason([season("first"),season("later",{starts_on:"2026-10-10"})],undefined,now).season?.season_id,"later");
  assert.throws(()=>resolveRankingSeason([season("current")],"unknown",now),/조회할 수 없는/);
});
