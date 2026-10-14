import {normalizeScheduleTime} from "./korea-time";
export const SERVICE_FEATURES = {scheduleCreation:"일정 생성 금지",comments:"댓글 작성·수정 금지",participation:"일정 참석 신청·그룹 변경 금지",access:"접속 금지",profile:"내 정보 수정 금지"} as const;
export type ServiceFeature = keyof typeof SERVICE_FEATURES;
export type MaintenanceSetting = {status:"normal"|"maintenance"|"restricted";message:string;startsAt:string|null;endsAt:string|null;blocked:Record<ServiceFeature,boolean>;allowedAccess:{admin:boolean;staff:boolean;pacer:boolean;member:boolean;guest:boolean}};
export function parseMaintenanceSetting(value: unknown): MaintenanceSetting | null {
  if(!value || typeof value!=="object" || Array.isArray(value))return null;
  const v=value as Record<string,unknown>;
  if(!["normal","maintenance","restricted"].includes(String(v.status)) || (v.message!==undefined&&typeof v.message!=="string") || String(v.message??"").length>2000)return null;
  const blocked={scheduleCreation:false,comments:false,participation:false,access:v.status==="restricted"&&v.blocked===undefined,profile:false};
  const allowedAccess={admin:true,staff:true,pacer:false,member:false,guest:false};
  for(const [key,defaults] of [["blocked",blocked],["allowedAccess",allowedAccess]] as const){
    if(v[key]===undefined)continue;
    if(!v[key]||typeof v[key]!=="object"||Array.isArray(v[key]))return null;
    const input=v[key] as Record<string,unknown>;
    if(Object.keys(input).some(name=>!(name in defaults)))return null;
    for(const name of Object.keys(defaults)){
      if(input[name]!==undefined){if(typeof input[name]!=="boolean")return null;Object.assign(defaults,{[name]:input[name]});}
    }
  }
  if(!allowedAccess.admin)return null;
  const time=(input:unknown)=>input==null||input===""?null:typeof input==="string"?normalizeScheduleTime(input):undefined;
  const startsAt=time(v.startsAt),endsAt=time(v.endsAt);
  if(startsAt===undefined||endsAt===undefined||(v.startsAt&&startsAt===null)||(v.endsAt&&endsAt===null)||(startsAt&&endsAt&&Date.parse(startsAt)>=Date.parse(endsAt)))return null;
  return {status:v.status as MaintenanceSetting["status"],message:String(v.message??""),startsAt,endsAt,blocked,allowedAccess};
}
export function canAccessDuringService(setting: MaintenanceSetting,profile:{role:string;is_pacer?:boolean}){
  if(setting.status==="normal"||profile.role==="admin")return true;
  if(setting.status==="maintenance")return profile.role==="staff";
  if(!setting.blocked.access)return true;
  return (profile.role==="staff"&&setting.allowedAccess.staff)||Boolean(profile.is_pacer&&setting.allowedAccess.pacer)||(profile.role==="member"&&setting.allowedAccess.member)||(profile.role==="guest"&&setting.allowedAccess.guest);
}
export function requestFeature(path:string,method:string):ServiceFeature|null{
  if((path==="/api/schedules"&&method==="POST")||(path==="/schedules/new"&&method==="GET"))return "scheduleCreation";
  if((/^\/api\/schedules\/[^/]+\/comments$/.test(path)&&method==="POST")||(/^\/api\/comments\/[^/]+$/.test(path)&&method==="PATCH"))return "comments";
  if(/^\/api\/schedules\/[^/]+\/participation$/.test(path)&&["POST","PATCH"].includes(method))return "participation";
  if(["/api/profile","/api/profile/password"].includes(path)&&method==="PATCH")return "profile";
  return null;
}
export function featureBlocked(setting:MaintenanceSetting,feature:ServiceFeature){return setting.status==="restricted"&&setting.blocked[feature];}
