import {RankingView} from "@/components/ranking/ranking-view";
import {canAdminister} from "@/lib/auth/account-access";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentPageProfile as getCurrentProfile } from "@/lib/auth/current-user";
import { loadRanking } from "@/lib/ranking-server";
export default async function Page({ searchParams }: { searchParams: Promise<{ seasonId?: string }> }) {
 const p = await getCurrentProfile();
 if (!p) redirect("/login");
 const params = await searchParams;
 let data;
 try { data = await loadRanking(params.seasonId,canAdminister(p)); }
 catch (error) { return <main className="mx-auto max-w-4xl px-6 py-12"><h1 className="text-3xl font-black">활동 랭킹</h1><p role="alert" className="mt-6">{error instanceof Error ? error.message : "조회에 실패했습니다."}</p><Link href="/leaderboard?seasonId=all">전체 시즌으로 돌아가기</Link></main>; }
 return <RankingView data={data} currentUserId={p.user_id}/>;
}
