import {cache} from 'react';
import {createSupabaseAdminClient} from './supabase/admin';
import {validSupportLink} from './support-link';
export const loadCrewSupportUrl=cache(async()=>{const {data,error}=await createSupabaseAdminClient().from('system_settings').select('setting_value').eq('setting_key','member_help').maybeSingle();if(error)return undefined;if(data)return validSupportLink(data.setting_value?.url)??undefined;return validSupportLink(process.env.NEXT_PUBLIC_CREW_SUPPORT_URL??'')??undefined;});
