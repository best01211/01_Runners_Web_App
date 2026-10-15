import { normalizeScheduleTime } from "../korea-time";
import { UUID } from "../regular-run-templates";
export type SchedulePayload = Record<string, unknown>;
const TYPES = new Set(["regular", "training", "flash", "event"]);
export function validateSchedulePayload(body: SchedulePayload) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "입력값을 확인해주세요." };
  const title=String(body.title??"").trim(), description=String(body.description??"").trim(), scheduleType=String(body.scheduleType??"").trim(), location=String(body.location??"").trim();
  const startAt=normalizeScheduleTime(String(body.startAt??"").trim()) ?? "", endAt=normalizeScheduleTime(String(body.endAt??"").trim()) ?? "", registrationStartAt=body.registrationStartAt ? (normalizeScheduleTime(String(body.registrationStartAt).trim()) ?? "invalid") : "", registrationEndAt=normalizeScheduleTime(String(body.registrationEndAt??"").trim()) ?? "";
  const eventKind=scheduleType==='event'?String(body.eventKind??'gathering'):null;
  if(eventKind!==null&&!['race','gathering'].includes(eventKind))return {error:'이벤트 유형을 선택해주세요.'};
  const capacity=eventKind==='race'?null:body.capacity===""||body.capacity==null?null:Number(body.capacity);
  const templateId = scheduleType === "regular" ? String(body.regularTemplateId ?? "").trim() || null : null;
  if (templateId && !UUID.test(templateId)) return {error:"정기런 양식을 확인해주세요."};
  if(title.length<2||title.length>100)return{error:"제목은 2~100자로 입력해주세요."}; if(!TYPES.has(scheduleType))return{error:"올바른 일정 유형을 선택해주세요."}; if(location.length<2)return{error:"장소를 입력해주세요."};
  if(Number.isNaN(Date.parse(startAt))||Number.isNaN(Date.parse(endAt)))return{error:"일정 시작과 종료 일시를 확인해주세요."}; if(new Date(startAt)>=new Date(endAt))return{error:"종료 일시는 시작 일시보다 늦어야 합니다."};
  if(registrationStartAt&&Number.isNaN(Date.parse(registrationStartAt)))return{error:"모집 시작 일시를 확인해주세요."}; if(Number.isNaN(Date.parse(registrationEndAt)))return{error:"모집 종료 일시를 확인해주세요."}; if(registrationStartAt&&new Date(registrationStartAt)>=new Date(registrationEndAt))return{error:"모집 종료는 모집 시작보다 늦어야 합니다."}; if(new Date(registrationEndAt)>new Date(startAt))return{error:"모집 종료는 일정 시작 전이어야 합니다."};
  if(eventKind&&!registrationStartAt)return {error:'이벤트 모집 시작 날짜와 시간을 입력해주세요.'};
  if(eventKind==='gathering'&&capacity===null)return {error:'행사 이벤트는 선착순 정원을 입력해주세요.'};
  if(capacity!==null&&(!Number.isInteger(capacity)||capacity<1))return{error:"정원은 1명 이상의 정수여야 합니다."};
  return{value:{...(eventKind?{event_kind:eventKind}:{}),title,description,schedule_type:scheduleType,location,start_at:new Date(startAt).toISOString(),end_at:new Date(endAt).toISOString(),registration_start_at:registrationStartAt?new Date(registrationStartAt).toISOString():null,registration_end_at:new Date(registrationEndAt).toISOString(),capacity,guest_allowed:body.guestAllowed===true,comment_enabled:body.commentEnabled!==false,staff_in_capacity:scheduleType==='event'?true:body.staffInCapacity!==false,regular_template_id:templateId,image_url:null,course_image_url:null}};
}
