type Account = { account_status: string; approval_status: string; role: string; withdrawal_pending?: boolean };
export function canUseService(profile: Account | null | undefined): boolean {
  return Boolean(profile && ["active", "restricted"].includes(profile.account_status) && profile.approval_status === "approved" && ["guest","member","staff","admin"].includes(profile.role) && !profile.withdrawal_pending);
}
export function canStartActivity(profile: Account | null | undefined): boolean {
  return canUseService(profile) && profile!.account_status === "active";
}
export function canRegisterTrackingEntries(profile:Account|null|undefined):boolean {
  return canStartActivity(profile)&&["admin","staff"].includes(profile!.role);
}

export function hasAdminAuthority(profile: {role:string;staff_position?:string|null}|null|undefined): boolean {
  return Boolean(profile && (profile.role === "admin" || (profile.role === "staff" && profile.staff_position === "president")));
}
export function canAdminister(profile: (Account & {staff_position?:string|null})|null|undefined): boolean {
  return canStartActivity(profile) && hasAdminAuthority(profile);
}
