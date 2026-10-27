export function attendancePresentation({startAt,status,opened,closed,now,today}:{startAt:string;status:string|null;opened:boolean;closed:boolean;now:number;today:boolean}) {
 if(status==="attended"||status==="late")return {label:status==="late"?"지각 · 인증 완료":"출석 완료",action:"출석 기록 보기",anchor:"#attendance",description:"출석 인증이 완료되었습니다."};
 if(status==="absent")return {label:"불참",action:"출석 기록 보기",anchor:"#attendance",description:"불참으로 기록되어 있습니다. 기록이 다르면 운영진에게 알려주세요."};
 if(closed)return {label:"출석 종료",action:"출석 기록 보기",anchor:"#attendance",description:"출석 인증이 종료되었습니다. 기록은 일정 상세에서 확인해주세요."};
 if(!today)return {label:"신청 완료",action:"신청 정보 보기",anchor:"",description:""};
 if(now<Date.parse(startAt))return {label:"시작 전",action:"오늘 일정 확인",anchor:"",description:"일정 시작 시각부터 출석할 수 있습니다."};
 if(!opened)return {label:"출석 시작 대기",action:"오늘 일정 확인",anchor:"",description:"운영진이 출석을 열면 인증할 수 있습니다."};
 if(status!=="not_checked")return {label:"출석 확인 필요",action:"오늘 일정 확인",anchor:"#attendance",description:"내 출석 기록을 확인해주세요. 기록이 없으면 현장 운영진에게 알려주세요."};
 return {label:"출석 인증 필요",action:"출석 인증하기",anchor:"#attendance",description:"현장에서 받은 4자리 번호로 출석을 인증해주세요."};
}
