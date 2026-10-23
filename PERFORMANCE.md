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


# 후속 수정: 페이지 데이터 표시와 정기런 참가 항목

## 데이터 표시 대기 제거
- 대시보드의 일정/개인 활동을 각각 서버 Suspense 영역으로 분리했다. 완료된 일정 데이터는 전체 크루 랭킹을 기다리지 않고 전달된다. 다음 러닝과 다가오는 일정은 하나의 조회 Promise를 공유한다. 완료된 UI 마크업과 CSS는 유지한다.
- 랭킹의 시즌/정책 조회를 병렬 실행하고, 페이서 조회를 최대 4개 배치까지만 병렬화한다. 전체 회원을 대상으로 한 순위 계산, 시즌 경계, 500행 페이지네이션은 유지한다.
- 일정 상세의 템플릿 이미지·참가자·그룹·댓글·출석을 병렬 조회한다. 참가자 결과에서 내 신청, 총인원, 그룹 인원을 함께 산출한다. 댓글은 기존 공개/삭제 처리 함수를 그대로 사용한다.
- 정상 조회된 비이벤트 상세 페이지에서는 최초 참여 인원·댓글·출석 API 요청이 3개에서 0개가 된다(해당 API만 센 코드 경로상 비교). 서버 데이터를 초기값으로 전달하며 이후 주기 확인과 변경 후 재조회는 유지한다. 댓글 비활성, 조회 오류, 자동 출석 종료가 필요한 일정 등은 예외다. 전체 API 요청 수가 0이라는 뜻은 아니다.
- 출석 데이터는 일반 회원에게 본인 기록만 전달한다. 전체 명단과 출석 코드는 기존 관리 권한이 있는 경우에만 전달한다. 종료 시각이 지난 미종료 정기런은 기존 API의 자동 마감 처리를 거치게 유지했다.
- 참가자 조회는 500행씩 순회해 PostgREST의 기본 행 제한으로 인원이 잘리는 것을 방지하며, 5000명 초과 시 부분 결과를 표시하지 않고 오류 처리한다.

## 기능 변경과 배포 순서
1. Supabase에 supabase/migrations/024_regular_support_groups.sql을 먼저 적용한다(023까지 적용된 DB 기준).
2. 그 뒤 애플리케이션을 배포한다. 코드에서 group_kind를 읽으므로 DB 적용 전 배포하면 상세 조회가 실패한다. 이 작업에서는 실제 원격 DB를 수정하지 않았다.
3. 6km를 포함해 5km 이상 정수 거리를 1km 단위로 입력할 수 있다. 화면·API·템플릿 검증·DB 제약을 함께 수정했다. 기존 거리 최소값은 유지한다.
4. 기존/신규 정기런에 짐보관(storage)과 포토(photo) 그룹을 추가한다. 러닝 그룹·짐보관·포토는 기존 단일 참가 선택 방식으로 하나를 선택한다. 복수 담당을 동시에 맡는 기능은 추가하지 않았다.
5. 짐보관은 DB 트리거로도 운영진 권한을 검증한다. 포토는 여러 회원이 기존 일정 정원/기간/계정/서비스 제한 아래 신청할 수 있다. 두 항목 모두 기존 참가 취소·그룹 변경 잠금·출석번호 인증 경로를 사용하며, 포토 출석은 일반 출석/랭킹 집계에 반영된다.
6. RLS 정책과 인증/권한 확인은 변경하지 않았다. 공유 사용자 캐시는 추가하지 않았다.

## 후속 검증 결과
- test:release 53개, test:auth 5개, test:tracking 30개 통과.
- PGlite PostgreSQL 테스트: 신규 정기런 지원 항목 21개, 기존 서비스 제한 24개, 기존 제한 계정 27개 검사 통과.
- 신규 DB 테스트는 마이그레이션 재실행, 기존 정기런 보완, 신규 정기런/유형 전환, 6km 저장, 비운영진 짐보관 신청/변경/사용자 재지정 차단, 포토 복수 신청/취소/재신청, 서비스 제한, 출석 반영/종료/잠금을 검증한다.
- test:dashboard-streaming: 실제 DashboardPage를 렌더하면서 랭킹 Promise를 미완료로 유지해도 실제 일정 제목 데이터가 먼저 전송되는지 확인했다. 이후 랭킹을 완료하면 개인 활동이 이어서 표시되고, 두 일정 영역의 조회는 한 번만 수행됨을 검증했다. 실제 Supabase 응답 시간을 측정한 테스트는 아니다.
- 운영 Vercel/Supabase 접속 정보와 테스트 계정은 없어 실제 전후 ms, 운영 DB 실행 계획, 브라우저에서의 계정별 시각 검증은 아직 하지 못했다.

## 주요 후속 변경 파일
- src/app/dashboard/page.tsx, src/components/dashboard/dashboard-view.tsx, src/lib/ranking-server.ts
- src/app/schedules/[scheduleId]/page.tsx, src/components/participation/participation-panel.tsx, src/components/comments/comment-panel.tsx, src/components/attendance/attendance-panel.tsx
- src/lib/query-pagination.ts, src/lib/schedule-comments-server.ts, src/lib/participation-groups.ts
- src/lib/regular-run-templates.ts, src/components/schedules/pace-group-editor.tsx, regular-template-form.tsx
- src/app/api/schedules/route.ts, src/app/api/schedules/[scheduleId]/route.ts 및 comments/participation/pace-groups/route.ts
- supabase/migrations/024_regular_support_groups.sql, scripts/test-dashboard-streaming.mjs, scripts/test-regular-support-database.mjs, tests/release/* 관련 회귀 테스트, package.json

- 최종 프로덕션 빌드 성공(컴파일 3.3초, TypeScript 4.4초, 정적 페이지 45개 생성 543ms). 최종 ESLint와 TypeScript 검사도 통과했다. 빌드 시간은 사용자 페이지 응답 시간 측정값이 아니다.
- SQL 테스트 의존성 재설치가 필요하면 `npm install --prefix .test-output/sql-qa --no-save @electric-sql/pglite` 후 `npm run test:regular-support-db`를 실행한다(기존 SQL 테스트와 같은 실행 방식).
- 운영 적용 시 DB 마이그레이션은 트랜잭션 안에서 제약/트리거를 변경하므로 짧은 테이블 잠금이 발생할 수 있다. 원격 DB 적용·Vercel 배포는 수행하지 않았다.
