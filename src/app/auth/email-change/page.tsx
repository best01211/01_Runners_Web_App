export const metadata = {
  title: "이메일 변경 확인 | 01Runners",
  robots: {index:false,follow:false},
  referrer: "no-referrer" as const,
};

export default async function EmailChangePage({searchParams}:{searchParams:Promise<{result?:string}>}) {
  const {result}=await searchParams;
  const verified=result==="verified";
  return <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-12">
    <section className="w-full max-w-lg rounded-2xl border bg-white p-6">
      <h1 className="text-2xl font-bold">이메일 변경 확인</h1>
      <p className="mt-4">{verified?"인증 링크를 처리했습니다. 변경을 요청한 계정의 내 정보에서 이메일을 확인해주세요.":"이 화면만으로 이메일 변경 완료 여부를 확인할 수 없습니다."}</p>
      {!verified&&<p className="mt-3 text-sm text-zinc-600">이메일 인증이 반영되었어도 로그인 세션 확인이 완료되지 않을 수 있습니다. 변경을 요청한 계정으로 로그인해 내 정보를 새로고침하세요. 필요한 인증을 모두 마쳤는데도 이메일이 바뀌지 않았다면 내 정보에서 이메일 변경을 다시 요청해주세요.</p>}
      <p className="mt-4 text-sm text-zinc-600">기존 이메일과 새 이메일 양쪽에 인증 안내가 도착했다면 모두 확인해야 합니다.</p>
      <p className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">이메일 변경 대상은 인증 메일의 요청으로 결정됩니다. 이 창에 다른 계정이 로그인되어 있어도 해당 계정의 이메일이 변경되는 것은 아닙니다. 변경을 요청한 계정의 내 정보에서 결과를 확인해주세요.</p>
    </section>
  </main>;
}
