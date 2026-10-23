# 페이지 전환 성능 점검 (2026-10-23)

## 검증 범위와 한계
프로덕션 접속 정보, 테스트 계정, .env 파일이 제공되지 않았다. 실제 서버 시간과 페이지 전환 전후 수치는 미측정이다. 아래 수치는 코드 경로의 요청 개수이며 실측 성능 개선율이 아니다. 프로덕션 병목이 해결됐다고 판정하지 않는다.

## 변경 및 요청 예산
- 보호 페이지 첫 진입: 클라이언트 인증 API 2개(me + service-status) → 1개(service-status). 상태 응답의 최소 표시 정보로 AppShell을 갱신한다.
- 보호 페이지 간 이동: 경로별 service-status 즉시 호출 1개는 유지한다. 프리패치/라우터 캐시가 있어도 계정 제한 확인이 지연되지 않도록 한다. 기존 10초 확인과 탭 복귀 확인도 유지한다. 숨겨진 탭/겹치는 요청 및 1초 안에 겹친 focus·visibility 이벤트를 합친다.
- 프록시: 인증 1개 + DB 3개는 유지한다. DB 3개를 직렬 → 병렬 처리한다. 이론상 DB 대기 시간은 합계 → 최댓값이며 실제 수치는 네트워크/DB 부하에 따라 다르다. 조기 차단 계정에는 기존보다 설정 조회가 늘 수 있다.
- getCurrentProfile: 인증 1개 + DB 3개를 유지하고 DB를 병렬 처리한다. React cache로 같은 서버 렌더 안의 반복 인증/프로필 조회만 합친다. 프로필 페이지의 두 번째 getUser는 렌더 내에서 재사용한다. 프록시와 렌더 사이의 인증은 신뢰 경계가 다르므로 유지한다. API 핸들러에서는 React memoization을 기대하지 않는다.
- 주요 페이지 내부 링크는 Next Link 기본 auto prefetch를 유지한다. loading.tsx는 Next가 Suspense 경계를 생성하며 동적 페이지의 부분 prefetch를 지원한다. 보호 데이터 전체 prefetch 강제 또는 공유 TTL 캐시는 추가하지 않았다.
- mutation 뒤 router.refresh 및 비밀번호 변경/탈퇴/상태 차단의 전체 이동은 데이터·세션 갱신 목적이므로 유지한다.
- 대시보드의 전체 랭킹 조회는 내 순위 산출에 필요하다. 사용자 필터는 결과를 바꾸므로 적용하지 않았다. 대용량 출석 페이지네이션과 페이서 조회는 실제 계측 대상이다.

## 계측 사용법
1. 환경 변수를 설정한 개발 환경에서 npm ci, npm run dev를 실행한다. 운영에서는 계측 로그가 꺼진다.
2. 서버의 [perf] proxy.total, auth.current-user, auth.profile, supabase.auth, supabase.query.<테이블>, page.dashboard.schedules/activity 로그를 수집한다. URL/사용자 ID/쿼리 값/토큰은 출력하지 않는다. 쿼리 시간은 HTTP 왕복 시간이며 순수 DB 실행 시간과 다르다.
3. 브라우저 콘솔의 [perf] navigation.commit은 링크 클릭부터 pathname 커밋까지다. Suspense 콘텐츠 완료 또는 최종 페인트 시간이 아니다. DevTools Network에서 RSC/API 수, TTFB, 콘텐츠 표시 시간을 함께 기록한다.
4. 같은 계정/데이터/네트워크로 dashboard→schedules→leaderboard→tracking→profile을 각 20회 반복하고, 초기 컴파일을 제외한 중앙값/p95를 비교한다. 개발 모드 StrictMode의 추가 실행과 프로덕션 prefetch 차이를 구분한다.
5. 기준 커밋에서도 같은 계측만 적용해 측정하고, 변경 버전과 비교한다. 운영 전환 속도는 별도의 동일 조건 Vercel 프리뷰에서 검증해야 한다. 현재 보고서에 만들어낸 ms 수치는 없다.

## 보안 회귀 검증
두 계정 전환, 승인 대기/거절, suspended/withdrawn, 탈퇴 대기, restricted 계정의 읽기·쓰기, admin/staff 권한, 점검/등급 제한/기능 제한을 각각 검증한다. 모든 상태 응답은 no-store이며 서버 권한 확인과 RLS를 변경하지 않았다. 프리패치된 기존 화면의 신선도는 Next 클라이언트 캐시 특성상 별도 확인해야 한다. 서버 API 검증은 매 요청 유지된다.

## 인덱스
profiles.user_id 및 system_settings.setting_key 키와 withdrawals_one_pending 인덱스가 인증 조회를 지원한다. diagnostics/navigation-performance.sql로 실제 인덱스와 EXPLAIN ANALYZE BUFFERS를 확인한다. 운영 데이터 실행 계획 없이 인덱스를 추가하거나 RLS를 바꾸지 않았다.

## 실행 결과
- test:auth 5/5, test:release 47/47, test:tracking 30/30 통과. 이는 기존 정책/도메인 테스트이며 실제 DB 또는 브라우저 통합 테스트가 아니다.
- 최초 npm ci는 registry.npmjs.org DNS ENOTFOUND로 실패했으나 재시도 설치 성공.
- npm run lint 및 tsc --noEmit 통과.
- npm run build: 최초 Google Fonts 네트워크 연결 오류로 실패. 네트워크 접근 재시도 후 성공(컴파일 3.1초, TypeScript 4.1초, 정적 페이지 45개 생성 571ms). 이 빌드 시간은 페이지 서버 처리/전환 시간과 무관하다.

## 변경 파일
- src/proxy.ts: 개발 타이밍, 독립 DB 조회 병렬화.
- src/lib/auth/current-user.ts: 렌더 범위 인증/프로필 재사용과 DB 조회 병렬화.
- src/lib/supabase/server.ts, admin.ts, src/lib/performance.ts: 개발 환경 HTTP 계측.
- src/app/api/auth/service-status/route.ts, src/components/navigation/app-shell.tsx, src/components/service/service-access-monitor.tsx: 상태·표시 정보 요청 통합과 이벤트 중복 억제.
- src/app/profile/page.tsx: 인증 결과 재사용.
- src/app/dashboard/page.tsx: 일정/활동 서버 처리 계측.
- src/app/layout.tsx, src/components/navigation/navigation-timing.tsx: 개발 전환 커밋 계측.
- src/components/navigation/page-loading.tsx 및 dashboard/schedules/leaderboard/tracking/profile/admin/staff/loading.tsx: 기존 진행 표시를 사용하는 Suspense fallback.
- supabase/diagnostics/navigation-performance.sql: 인덱스/실행 계획 확인용 읽기 전용 SQL.
