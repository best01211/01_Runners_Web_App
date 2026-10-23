import { isUUID, validateRaceWrite } from "./validation";

export const MAX_REGISTRATION_BYTES = 3_500_000;
export const MAX_GPX_FILE_BYTES = 10_000_000;
export type Registration = {
 name: string; location: string; parentRaceId?: string;
 courses: { courseName: string; distanceMeters: number; startAt: string; points: {latitude:number;longitude:number}[] }[];
};
export function validateRegistration(value: unknown): Registration {
 if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("대회 정보를 확인해주세요.");
 const b=value as Record<string,unknown>;
 if(typeof b.name!=="string"||!b.name.trim()||b.name.trim().length>100||typeof b.location!=="string"||b.location.trim().length>200)throw new Error("대회 이름과 장소를 확인해주세요.");
 if(b.parentRaceId!==undefined&&!isUUID(b.parentRaceId))throw new Error("대회를 선택해주세요.");
 if(!Array.isArray(b.courses)||b.courses.length<1||b.courses.length>20)throw new Error("종목은 1~20개 등록할 수 있습니다.");
 const names=new Set<string>();
 const courses=b.courses.map((raw,index)=>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error(`${index+1}번째 종목 정보를 확인해주세요.`);
  const course=validateRaceWrite({...raw,action:"course",name:b.name});
  if(course.action!=="course"||!course.courseName)throw new Error(`${index+1}번째 종목 이름을 입력해주세요.`);
  if(names.has(course.courseName))throw new Error("종목 이름은 서로 다르게 입력해주세요.");
  names.add(course.courseName);
  return {courseName:course.courseName,distanceMeters:course.distanceMeters,startAt:course.startAt,points:course.points};
 });
 return {name:b.name.trim(),location:b.location.trim(),...(b.parentRaceId?{parentRaceId:b.parentRaceId as string}:{}),courses};
}
