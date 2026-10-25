import {timingCredentials} from "@/lib/race-tracking/myresult-server";
import {myResultSource} from "@/lib/race-tracking/myresult";
import {canAdminister,canUseService,canRegisterTrackingEntries} from "@/lib/auth/account-access";
import type {CurrentProfile} from "@/lib/auth/current-user";
import {createSupabaseAdminClient} from "@/lib/supabase/admin";
import type {RaceSnapshot} from "@/lib/race-tracking/live-types";
import type {Checkpoint} from "@/lib/race-tracking/types";
export async function loadTrackingSnapshot(raceId:string,profile:CurrentProfile):Promise<RaceSnapshot>{
 if(!canUseService(profile)||profile.service_blocked?.liveTracking)throw new Error("FORBIDDEN");
 const admin=createSupabaseAdminClient(),canManage=canAdminister(profile),canRegisterEntries=canRegisterTrackingEntries(profile);
 const profileQuery=admin.from("profiles").select("user_id,name").eq("account_status","active").eq("approval_status","approved").order("name").order("user_id");
 const [courseResult,entryResult]=await Promise.all([
  admin.from("tracking_races").select("name,status,distance_meters,points,start_at,parent_race_id,course_name,timing_course_code").eq("race_id",raceId).maybeSingle(),
  admin.from("tracking_race_entries").select("entry_id,user_id,runner_name,bib,target_pace_seconds,status,group_id").eq("race_id",raceId).is("deleted_at",null).limit(501),
 ]);
 if(courseResult.error||entryResult.error)throw new Error("DATABASE_ERROR");
 const course=courseResult.data,entries=entryResult.data;
 if(!course||course.status!=="active")throw new Error("NOT_FOUND");
 if((entries?.length??0)>500)throw new Error("CAPACITY_LIMIT");
 let courseLocked=Boolean(entries?.length);
 if(!courseLocked){
  const prior=await admin.from("tracking_race_entries").select("entry_id").eq("race_id",raceId).limit(1);
  if(prior.error)throw new Error("DATABASE_ERROR");
  courseLocked=Boolean(prior.data?.length);
 }
 const eventId=course.parent_race_id??raceId;
 const ids=(entries??[]).map(e=>e.user_id).filter((id): id is string => Boolean(id));
 const [siblings,groupResult,profileResult,sourceResult,syncResult]=await Promise.all([
  admin.from("tracking_races").select("race_id,course_name,distance_meters,start_at,status,timing_course_code").or(`race_id.eq.${eventId},parent_race_id.eq.${eventId}`).eq("status","active").order("distance_meters",{ascending:false}),
  admin.from("tracking_pace_groups").select("group_id,name,pace_seconds").eq("race_id",raceId).order("pace_seconds"),
  profileQuery.in("user_id",ids.length?ids:["00000000-0000-0000-0000-000000000000"]).limit(500),
  admin.from("tracking_timing_sources").select("source_url,enabled").eq("race_id",eventId).maybeSingle(),
  admin.from("tracking_timing_sync").select("status,message,last_synced_at,last_attempt_at,next_at").eq("race_id",raceId).maybeSingle(),
 ]);
 if(siblings.error||groupResult.error||sourceResult.error||syncResult.error)throw new Error("DATABASE_ERROR");
 if(!siblings.data?.some(c=>c.race_id===eventId))throw new Error("NOT_FOUND");
 const groups=groupResult.data??[];
 const {data:profiles,error:profileError}=profileResult;
 if(profileError)throw new Error("DATABASE_ERROR");
 const eligible=new Map((profiles??[]).map(p=>[p.user_id,p]));
 const visibleEntries=(entries??[]).filter(e=>e.user_id ? eligible.has(e.user_id) : Boolean(e.runner_name?.trim()));
 const checkpointMap: Record<string, Checkpoint[]> = {};
 // Each runner has a bounded checkpoint count. Paging avoids Supabase's default row cap.
 if (visibleEntries.length) {
  for (let offset = 0; ; offset += 1000) {
   const { data: records, error: recordError } = await admin.from("tracking_checkpoints").select("checkpoint_id,entry_id,name,distance_meters,passed_at,received_at,source").in("entry_id", visibleEntries.map(e => e.entry_id)).order("checkpoint_id").range(offset, offset + 999);
   if(recordError)throw new Error("DATABASE_ERROR");
   for (const r of records ?? []) (checkpointMap[r.entry_id] ??= []).push({ id: r.checkpoint_id, name: r.name, distanceMeters: r.distance_meters, passedAt: r.passed_at, receivedAt: r.received_at, source: r.source==="myresult"?"myresult":"manual" });
   if ((records?.length ?? 0) < 1000) break;
  }
 }
 const snapshot: RaceSnapshot = {
  canRegisterEntries,
  ...(sourceResult.data?{timing:{collectionMode:"public-page",sourceUrl:sourceResult.data.source_url,courseCode:course.timing_course_code,enabled:sourceResult.data.enabled,credentialsReady:!!timingCredentials(myResultSource(sourceResult.data.source_url).id),lastSyncedAt:syncResult.data?.last_synced_at??null,lastAttemptAt:syncResult.data?.last_attempt_at??null,nextRefreshAt:syncResult.data?.next_at??null,status:!sourceResult.data.enabled?"disabled":syncResult.data?.status??"ready",message:syncResult.data?.message??""}}:{}),
  raceId,eventId,courses:(siblings.data??[]).map(c=>({raceId:c.race_id,name:c.course_name,distanceMeters:c.distance_meters,startAt:c.start_at,timingCourseCode:c.timing_course_code})),
  groups:groups.map(g=>({groupId:g.group_id,name:g.name,paceSeconds:g.pace_seconds})),
  serverNow: new Date().toISOString(), title: course.name, currentUserId: profile.user_id, canManage: canManage, courseLocked,
  course: course ? { name: course.course_name, distanceMeters: course.distance_meters, points: course.points, startAt: course.start_at } : null,
  participants: [],
  entries: visibleEntries.filter(() => canRegisterEntries).map(e => ({ entryId: e.entry_id, userId: e.user_id, bib: e.bib })),
  runners: visibleEntries.map(e => ({ id: e.entry_id, name: e.runner_name?.trim() || eligible.get(e.user_id)!.name, bib: e.bib, startAt: course!.start_at, groupName:groups.find(g=>g.group_id===e.group_id)?.name, groupPaceSeconds:groups.find(g=>g.group_id===e.group_id)?.pace_seconds, useGroupPrediction:!!e.group_id, targetPaceSeconds: e.target_pace_seconds ?? undefined, status: e.status })),
  checkpoints: checkpointMap,
 };
 return snapshot;
}
