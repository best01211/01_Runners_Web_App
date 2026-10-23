import {createSupabaseAdminClient} from "@/lib/supabase/admin";
import {visibleComments} from "@/lib/comment-visibility";
import {orderComments} from "@/lib/comment-order";
import {publicComment} from "@/lib/public-data";
export async function loadScheduleComments(scheduleId:string) {
 const {data,error}=await createSupabaseAdminClient().from("comments").select("*,profiles:author_id(role,name)").eq("schedule_id",scheduleId).order("created_at",{ascending:false});
 if(error)throw new Error("댓글을 불러오지 못했습니다.");
 return orderComments(visibleComments(data??[]).map(comment=>publicComment({...comment,author_name:comment.profiles?.name?.trim()||comment.author_name})));
}
