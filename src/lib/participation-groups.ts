export type ParticipationGroup = {pace_group_id:string;pace_seconds:number;distance_km:number;group_kind?:"running"|"storage"|"photo"};
export function participationGroupLabel(group: ParticipationGroup) {
  if (group.group_kind === "storage") return "짐보관";
  if (group.group_kind === "photo") return "포토";
  return `${Math.floor(group.pace_seconds/60)}:${String(group.pace_seconds%60).padStart(2,"0")} / ${group.distance_km}km`;
}
export function canSelectParticipationGroup(group: ParticipationGroup, staff: boolean) {
  return group.group_kind !== "storage" || staff;
}
