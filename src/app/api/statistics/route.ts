import { fail, ok } from "@/lib/api-response";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { loadRanking } from "@/lib/ranking-server";
export async function GET(request: Request) {
 const p = await getCurrentProfile();
 if (!p) return fail("UNAUTHORIZED", "로그인이 필요합니다.", 401);
 try {
  const data = await loadRanking(new URL(request.url).searchParams.get("seasonId"),p.role === "admin");
  return ok({ ...data, me: data.ranking.find(row => row.userId === p.user_id) ?? null });
 } catch (error) { return fail("RANKING_FAILED", error instanceof Error ? error.message : "랭킹 조회에 실패했습니다.", 500); }
}
