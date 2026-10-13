import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { RegularRunTemplate } from "@/lib/regular-run-templates";
export async function loadRegularTemplates(): Promise<RegularRunTemplate[]> {
  const { data, error } = await createSupabaseAdminClient().from("regular_run_templates").select("template_id,name,description,location,capacity,image_url,deleted_at,pace_groups").is("deleted_at", null).order("created_at");
  if (error) throw new Error("정기런 양식을 불러오지 못했습니다. 014 SQL 적용 상태를 확인해주세요.");
  return data ?? [];
}
