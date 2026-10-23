export const legacyMemberFields = 'user_id,login_id,name,nickname,email,phone,birth_date,role,staff_position,account_status,approval_status,ranking_excluded,is_pacer,is_test_account,anonymized_at,created_at';
export const memberFields = 'user_id,login_id,name,nickname,email,phone,birth_date,role,admin_account,admin_mode_normal,staff_position,account_status,approval_status,ranking_excluded,is_pacer,is_test_account,anonymized_at,created_at';
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const attendanceLabels: Record<string,string> = {attended:'출석',late:'지각',absent:'불참',not_checked:'미확인'};
export function memberRole(role:string,position?:string|null){return role==='staff'?({president:'회장',vice_president:'부회장',staff:'운영진'}[position??'staff']??'운영진'):({admin:'관리자',member:'회원',guest:'게스트',pending:'승인 대기'}[role]??role);}
export type AttendanceRecord = {attendance_id:string;user_id:string;status:string;method:string|null;checked_at:string|null;schedules:{title:string;start_at:string;location:string;status:string;deleted_at:string|null}|null};
export function csvCell(value:unknown){let text=String(value??'');if(/^[\s]*[=+@-]/.test(text)||/^[\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
