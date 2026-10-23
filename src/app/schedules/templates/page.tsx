import {redirect} from "next/navigation";
import {getCurrentPageProfile as getCurrentProfile,isStaffOrAdmin} from "@/lib/auth/current-user";

export default async function RegularTemplatesPage(){
 const profile=await getCurrentProfile();
 if(!isStaffOrAdmin(profile))redirect('/schedules');
 redirect('/admin?tab=templates');
}
