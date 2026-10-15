export function isAttendanceCode(value:unknown):value is string {
 return typeof value==='string'&&/^[0-9]{4}$/.test(value);
}
