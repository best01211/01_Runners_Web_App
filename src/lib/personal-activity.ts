import {buildRanking,type RankingAttendance,type ScorePolicy} from "./ranking";

export function buildPersonalActivity(rows:RankingAttendance[],policy:ScorePolicy,pacers:Set<string>,userId:string,season?:{starts_on:string;ends_on:string}|null) {
 const ranking=buildRanking(rows,policy,pacers,season);
 const index=ranking.findIndex(row=>row.userId===userId);
 const scored=buildRanking(rows.filter(row=>row.user_id===userId),{...policy,minimumAttendance:0},pacers,season)[0];
 const start=season?Date.parse(`${season.starts_on}T00:00:00+09:00`):-Infinity;
 const end=season?Date.parse(`${season.ends_on}T00:00:00+09:00`)+86400000:Infinity;
 const counts={attended:0,late:0,absent:0};
 for(const row of rows) {
  const schedule=row.schedules,at=schedule?Date.parse(schedule.start_at):NaN;
  if(row.user_id!==userId||!schedule||schedule.status==='cancelled'||schedule.deleted_at||!Number.isFinite(at)||at<start||at>=end)continue;
  if(row.status==='attended'||row.status==='late'||row.status==='absent')counts[row.status]++;
 }
 const total=counts.attended+counts.late+counts.absent;
 return {rank:index<0?null:index+1,score:scored?.score??null,...counts,total,attendanceRate:total?Math.round((counts.attended+counts.late)/total*100):null};
}

export type PersonalActivity=ReturnType<typeof buildPersonalActivity> & {seasonName:string};
