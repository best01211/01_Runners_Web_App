import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { loadRanking } from "@/lib/ranking-server";
export default async function Page({ searchParams }: { searchParams: Promise<{ seasonId?: string }> }) {
 const p = await getCurrentProfile();
 if (!p) redirect("/login");
 const params = await searchParams;
 let data;
 try { data = await loadRanking(params.seasonId,p.role === "admin"); }
 catch (error) { return <main className="mx-auto max-w-4xl px-6 py-12"><h1 className="text-3xl font-black">활동 랭킹</h1><p role="alert" className="mt-6">{error instanceof Error ? error.message : "조회에 실패했습니다."}</p><Link href="/leaderboard">기본 시즌으로 돌아가기</Link></main>; }
 return <main className="mx-auto min-h-screen max-w-4xl px-6 py-12"><header className="flex justify-between"><h1 className="text-3xl font-black">활동 랭킹</h1><Link href="/dashboard">대시보드</Link></header>
 <form className="mt-6 flex gap-2"><select name="seasonId" defaultValue={data.season?.season_id ?? ""} className="input"><option value="">기본 시즌</option>{data.seasons.map(s => <option key={s.season_id} value={s.season_id}>{s.name}</option>)}</select><button className="shrink-0 rounded-xl border px-4">조회</button></form>
 <p className="mt-4 text-sm text-zinc-600">{data.season ? `${data.season.name} · ${data.season.starts_on} ~ ${data.season.ends_on}` : "기본 시즌이 없어 전체 기간을 표시합니다."} · 출석 {data.policy.attended}점 · 지각 {data.policy.late}점 · 불참 {data.policy.absent}점 · 페이서 추가 {data.policy.pacer}점 · 최소 활동 {data.policy.minimumAttendance}회</p>
 <div className="mt-8 space-y-2">{data.ranking.length === 0 && <p>조건에 맞는 활동 기록이 없습니다.</p>}{data.ranking.map((row,i) => <div key={row.userId} className="flex flex-wrap justify-between gap-3 rounded-xl bg-zinc-50 p-4"><b>{i+1}위 · {row.name}</b><span>{row.score}점</span><span>출석 {row.attended} · 지각 {row.late}</span><span>출석률 {row.attendanceRate}%</span></div>)}</div></main>;
}
