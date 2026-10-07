export function canEditScheduleType(role: string, nextType: string) {
  return role === "admin" || role === "staff" || (role === "member" && nextType === "flash");
}
