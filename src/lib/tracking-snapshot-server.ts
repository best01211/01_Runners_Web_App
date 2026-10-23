import {canAdminister,canUseService} from "@/lib/auth/account-access";
import type {CurrentProfile} from "@/lib/auth/current-user";
import {createSupabaseAdminClient} from "@/lib/supabase/admin";
import type {RaceSnapshot} from "@/lib/race-tracking/live-types";
import type {Checkpoint} from "@/lib/race-tracking/types";
export async function loadTrackingSnapshot(raceId:string,profile:CurrentProfile):Promise<RaceSnapshot>{
 if(!canUseService(profile)||profile.service_blocked?.liveTracking)throw new Error("FORBIDDEN");
 const admin=createSupabaseAdminClient(),canManage=canAdminister(profile);
 let profileQuery=admin.from("profiles").select("user_id,nickname,name").eq("account_status","active").eq("approval_status","approved");
 if(profile.role!=="admin")profileQuery=profileQuery.neq("role","admin");
 const [courseResult,entryResult,managerProfiles]=await Promise.all([
  admin.from("tracking_races").select("name,status,distance_meters,points,start_at").eq("race_id",raceId).maybeSingle(),
  admin.from("tracking_race_entries").select("entry_id,user_id,bib,target_pace_seconds,status").eq("race_id",raceId).limit(501),
  canManage?profileQuery.limit(500):Promise.resolve(null),
 ]);
 if(courseResult.error||entryResult.error)throw new Error("DATABASE_ERROR");
 const course=courseResult.data,entries=entryResult.data;
 if(!course||course.status!=="active")throw new Error("NOT_FOUND");
 if((entries?.length??0)>500)throw new Error("CAPACITY_LIMIT");
 const ids=(entries??[]).map(e=>e.user_id);
 const {data:profiles,error:profileError}=managerProfiles??await profileQuery.in("user_id",ids.length?ids:["00000000-0000-0000-0000-000000000000"]).limit(500);
 if(profileError)throw new Error("DATABASE_ERROR");
 const eligible=new Map((profiles??[]).map(p=>[p.user_id,p]));
 const visibleEntries=(entries??[]).filter(e=>eligible.has(e.user_id));
 const checkpointMap: Record<string, Checkpoint[]> = {};
 // Each runner has a bounded checkpoint count. Paging avoids Supabase's default row cap.
 if (visibleEntries.length) {
  for (let offset = 0; ; offset += 1000) {
   const { data: records, error: recordError } = await admin.from("tracking_checkpoints").select("checkpoint_id,entry_id,name,distance_meters,passed_at,received_at,source").in("entry_id", visibleEntries.map(e => e.entry_id)).order("checkpoint_id").range(offset, offset + 999);
   if(recordError)throw new Error("DATABASE_ERROR");
   for (const r of records ?? []) (checkpointMap[r.entry_id] ??= []).push({ id: r.checkpoint_id, name: r.name, distanceMeters: r.distance_meters, passedAt: r.passed_at, receivedAt: r.received_at, source: "manual" });
   if ((records?.length ?? 0) < 1000) break;
  }
 }
 const snapshot: RaceSnapshot = {
  serverNow: new Date().toISOString(), title: course.name, currentUserId: profile.user_id, canManage: canManage, courseLocked: Boolean(entries?.length),
  course: course ? { name: course.name, distanceMeters: course.distance_meters, points: course.points, startAt: course.start_at } : null,
  participants: [...eligible.values()].filter(() => canManage).map(p => ({ userId: p.user_id, name: p.nickname?.trim() || p.name })),
  entries: visibleEntries.filter(() => canManage).map(e => ({ entryId: e.entry_id, userId: e.user_id, bib: e.bib })),
  runners: visibleEntries.map(e => ({ id: e.entry_id, name: eligible.get(e.user_id)!.nickname?.trim() || eligible.get(e.user_id)!.name, bib: e.bib, startAt: course!.start_at, targetPaceSeconds: e.target_pace_seconds ?? undefined, status: e.status })),
  checkpoints: checkpointMap,
 };
 return snapshot;
}
