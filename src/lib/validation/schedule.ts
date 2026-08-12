export type SchedulePayload = Record<string, unknown>;
const TYPES = new Set(["regular", "training", "flash", "event"]);
export function validateSchedulePayload(body: SchedulePayload) {
  const title=String(body.title??"").trim(), description=String(body.description??"").trim(), scheduleType=String(body.scheduleType??"").trim(), location=String(body.location??"").trim();
  const startAt=String(body.startAt??"").trim(), endAt=String(body.endAt??"").trim(), registrationStartAt=String(body.registrationStartAt??"").trim(), registrationEndAt=String(body.registrationEndAt??"").trim();
  const capacity=body.capacity===""||body.capacity==null?null:Number(body.capacity);
  if(title.length<2||title.length>100)return{error:"제목은 2~100자로 입력해주세요."}; if(!TYPES.has(scheduleType))return{error:"올바른 일정 유형을 선택해주세요."}; if(location.length<2)return{error:"장소를 입력해주세요."};
  if(Number.isNaN(Date.parse(startAt))||Number.isNaN(Date.parse(endAt)))return{error:"일정 시작과 종료 일시를 확인해주세요."}; if(new Date(startAt)>=new Date(endAt))return{error:"종료 일시는 시작 일시보다 늦어야 합니다."};
  if(registrationStartAt&&Number.isNaN(Date.parse(registrationStartAt)))return{error:"모집 시작 일시를 확인해주세요."}; if(Number.isNaN(Date.parse(registrationEndAt)))return{error:"모집 종료 일시를 확인해주세요."}; if(registrationStartAt&&new Date(registrationStartAt)>=new Date(registrationEndAt))return{error:"모집 종료는 모집 시작보다 늦어야 합니다."}; if(new Date(registrationEndAt)>new Date(startAt))return{error:"모집 종료는 일정 시작 전이어야 합니다."};
  if(capacity!==null&&(!Number.isInteger(capacity)||capacity<1))return{error:"정원은 1명 이상의 정수여야 합니다."};
  return{value:{title,description,schedule_type:scheduleType,location,start_at:new Date(startAt).toISOString(),end_at:new Date(endAt).toISOString(),registration_start_at:registrationStartAt?new Date(registrationStartAt).toISOString():null,registration_end_at:new Date(registrationEndAt).toISOString(),capacity,guest_allowed:body.guestAllowed===true,comment_enabled:body.commentEnabled!==false,staff_in_capacity:body.staffInCapacity!==false,image_url:String(body.imageUrl??"").trim()||null,course_image_url:String(body.courseImageUrl??"").trim()||null}};
}
