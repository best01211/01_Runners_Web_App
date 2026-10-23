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


# 운영 기능 및 추가 데이터 표시 개선

## 변경
- 회원 목록 조회에 역할·활성 상태·랭킹 제외·페이서·삭제 확인용 아이디를 함께 포함한다. 회원 설정을 펼칠 때 수행하던 별도 API 요청(클릭당 1회)을 제거했다. 저장은 기존 서버 권한 검사와 DB RPC를 그대로 거친다.
- 회원 목록과 탈퇴 신청 조회를 병렬화하고, 삭제 재시도 목록은 Suspense로 분리해 회원 목록 표시를 막지 않게 했다. 목록은 500행씩 페이지 조회한다.
- 라이브 추적 상세의 조회 로직을 서버/API 공용으로 통합했다. 페이지 조회 후 최초 API 재조회(1회)를 제거하고, 대회·출전자·관리자용 회원 후보를 병렬 조회한다. 기존 15초 갱신은 유지한다. 관리자 이외 사용자에게는 기존 관리자 제외와 선수 필터를 유지한다.
- 랭킹의 취소·삭제 일정 제외 조건을 DB 조회에도 적용해 계산에서 버려질 데이터를 가져오지 않도록 했다. 개인 출석 집계 규칙과 순위 계산은 유지한다.
- 운영 메뉴의 링크 클릭 및 경로 변경 시 details 토글을 닫는다. 같은 /admin의 쿼리 탭 이동도 클릭 시 닫힌다.
- 취소 일정은 관리자에게 ‘취소 상태 유지’와 ‘영구 삭제’를 제공한다. 취소한 미래 일정도 지난 일정 목록에 표시한다. 영구 삭제는 관리자 등급만 가능하며, ‘영구 삭제’ 입력 확인과 취소 상태를 서버/DB에서 재검증한다.
- 영구 삭제는 FK로 연결된 일정 참가·출석·댓글·일정 코스/출전자/체크포인트·비공개 테스트 기록을 트랜잭션으로 제거한다. 정기런 양식/공유 이미지와 독립 tracking_races 대회는 지우지 않는다. 알 수 없는 연결 테이블은 전체 롤백하며, 복구 API는 제공하지 않는다.
- 관리자는 정기런/번개런/훈련/이벤트에 비공개 테스트 참가·선택 변경·취소·출석번호 인증을 할 수 있다. 일반 참가 테이블과 분리해 참가 인원·정원·공개 출석·랭킹에는 영향을 주지 않는다. 새 테이블 RLS는 본인 관리자에게만 읽기를 허용하고 직접 쓰기는 막는다. 기존 테이블의 RLS 정책은 수정하지 않았다.
- 관리자 설정에 liveTracking 기능 제한을 추가했다. 페이지/API 진입 차단, 열린 화면의 기존 상태 확인 주기 내 이동, DB 추적 권한 함수에서 적용한다. 레거시 추적 쓰기 RPC는 기존 007에서 authenticated 실행 권한이 회수된 상태를 유지한다.

## 회원 관리의 삭제 여부 설명
‘계정 존재’는 DB 프로필이 남아 있다는 의미이며 활성/제한/정지 여부와 다르다. 탈퇴 완료·익명화 계정도 프로필이 남아 있으면 표시된다. 완전 삭제된 계정은 목록에 나오지 않는다.

‘사용자 정보·기록 삭제’는 개인정보, 해당 회원의 참가/출석/댓글/개인 대회 기록과 연결 사진, 인증 계정을 영구 삭제한다. 공동 일정/공동 대회와 다른 회원의 기록은 유지하며 필요한 작성자/운영자 연결은 처리 관리자에게 이전한다. 본인·관리자 계정은 보호된다. 삭제는 DB 정리 → 스토리지 정리 → Auth 삭제 → 완료 상태 기록 순서이며 중간 실패 시 ‘삭제 계속하기’로 남은 정리를 재시도한다.

탈퇴 승인과는 다르다. 탈퇴 승인은 개인정보를 익명화하고 인증 계정을 삭제하되 과거 활동의 참조 관계를 유지한다. 완전 삭제는 해당 회원의 활동 기록도 제거한다. 이번 작업에서 회원 삭제 절차 자체는 변경하지 않았다.

## 배포와 한계
- 024 적용 후 supabase/migrations/025_schedule_admin_controls.sql을 먼저 적용하고 애플리케이션을 배포해야 한다. 원격 DB 적용·실제 일정/회원 삭제·Vercel 배포는 실행하지 않았다.
- 신규 DB 테스트 30개 검사: 관리자/운영진/회원/다른 관리자 간 비공개 기록 격리, 계정/서비스 제한, 테스트 출석의 공개 집계 비반영, 취소 일정만 삭제, 관리자 권한과 확인 문구, 연결 기록 전체 삭제, 이웃 일정 보존, 알 수 없는 FK에서 롤백, 추적 차단 등을 확인했다.
- 기존 정기런 지원 DB 21개, 서비스 제한 DB 24개, 제한 계정 DB 27개, 회원 삭제 DB 39개 검사도 통과했다.
- 회원 상세/CSV API, 회원 목록 및 운영 권한 스크립트 통과. 단위 테스트(릴리스 54개·인증 5개·추적 30개), 대시보드 스트리밍 테스트 통과.
- 프로덕션 빌드 및 ESLint/TypeScript 검사 통과. 최종 UI의 브라우저 시각 검증과 실제 Vercel 데이터 응답시간은 테스트 계정/운영 접속 정보 부재로 확인하지 못했다. 위 API 감소 수치는 코드 경로 비교이며 실측 ms 또는 전체 페이지의 응답 개선율이 아니다.
- 큰 시즌의 전체 랭킹 조회 및 Supabase/Vercel 리전 간 왕복 시간은 여전히 운영 계측 대상이다. 공유 계정/상태 캐시로 우회하지 않았다.


# 빈 본문 후 데이터 표시 지연: 인증 중복 제거 및 일정 쿼리 통합

## 확인된 실행 경로와 수정
- 러닝 일정 페이지는 프록시에서 getUser 1회 + DB 3회가 끝난 후, 페이지 getCurrentProfile에서 같은 getUser 1회 + DB 3회를 다시 기다리고 있었다. 이후 일정 조회 3개가 실행됐다. 로딩 화면만 수정하는 것으로는 이 서버 대기를 줄일 수 없다.
- 프록시가 현재 요청에서 검증한 전체 프로필/탈퇴 대기/서비스 제한 결과를 내부 요청 헤더로 전달한다. HMAC 서명과 현재 쿠키에 대한 바인딩, 형식/유효시간 검증을 적용한다. 클라이언트가 보낸 해당 헤더는 프록시 입구에서 항상 삭제한다. 세션 갱신 시 요청 쿠키와 모든 응답 쿠키를 유지한다.
- 페이지 전용 getCurrentPageProfile만 이 결과를 소비한다. API/쓰기 작업의 getCurrentProfile은 이 헤더를 읽지 않고 기존 인증·DB 검증을 수행한다. 서명이 없거나 잘못됐거나 쿠키가 다르거나 만료되면 페이지도 기존 검증으로 돌아간다.
- 공유 프로필 캐시나 사용자 간 TTL 캐시를 도입하지 않았다. 60초는 내부 전달 값의 검증 한도이며, 다음 요청에서 프로필을 60초 동안 재사용한다는 뜻이 아니다. 다음 요청의 프록시는 DB에서 계정·승인·탈퇴·점검 상태를 다시 검사한다.
- src/app의 주요 서버 페이지는 페이지 전용 접근자를 사용한다. 내 정보 페이지의 실제 Auth 이메일 조회처럼 별도로 필요한 조회는 남겨뒀다.
- /api/auth/service-status는 핸들러 자체에서 인증/프로필/탈퇴/점검을 전부 검증하므로 프록시의 동일 검증을 생략한다. 10초 확인 주기는 유지하고 핸들러에서 세션 쿠키 갱신을 수행한다. 다른 API의 프록시 검증은 유지한다.
- get_upcoming_schedule_summaries RPC로 가까운 정기런·훈련과 한 달 내 이벤트/번개를 한 번에 읽는다. 500건 이상은 페이지 순회하며, 기존 유형별 선택·종료/취소/삭제 제외·한국 달력 월말 경계를 유지한다. SQL 026 미적용 시 기존 조회로 돌아가지만 실패한 RPC 1회가 추가되므로 운영 성능 적용에는 먼저 026을 설치해야 한다.

## 요청 개수와 테스트 결과
- 일반적인 /schedules 진입의 인증 관련 Supabase 요청: 8회 → 4회.
- 500건 미만 다가오는 일정 조회: 3회 → 1회(SQL 026 적용 시).
- 따라서 해당 경로의 Supabase 요청 합계: 11회 → 5회. 별도 브라우저 상태 확인/프리패치/기타 요청을 모두 합친 숫자는 아니다.
- 상태 확인 API의 Supabase 요청도 프록시+핸들러 8회 → 핸들러 4회로 줄였다.
- 실제 프록시/페이지 접근자를 사용한 통제 테스트: 요청당 가상 지연 20ms, 5회 중앙값 120.8ms → 64.0ms. 이는 실제 Vercel/Supabase 왕복 시간이 아닌 모의 네트워크 환경의 인증 경로 수치다.
- 보안 회귀: 서명/권한 변조, 다른 세션 쿠키, 유효시간, 외부에서 주입한 유효 서명 헤더 덮어쓰기, API의 독립 재검증, 쿠키 갱신 보존, 다음 요청의 정지/탈퇴/점검 차단을 확인했다.
- SQL 026 PGlite 6개 검사 통과: 기존 선택 함수와 결과 일치, 월말 경계, 진행 중 훈련, 취소/삭제 제외, 1,001건 이상 이벤트, 일반 인증 사용자의 직접 RPC 실행 차단과 서비스 역할 실행 허용.
- 일정 서버 로더 테스트: 소규모 목록 1 RPC, 1,001건 페이지 순회, 미적용 SQL의 안전한 대체 조회, 오류 시 부분 결과 미표시 통과.
- 기존 릴리스 54개·인증 5개·추적 30개, 대시보드 스트리밍, 회원 관리/상세 권한 테스트 통과. 최종 빌드와 ESLint/TypeScript도 통과했다.

## 적용 및 남은 확인
- supabase/migrations/026_upcoming_schedule_query.sql을 적용한 뒤 코드를 배포한다. 기존 RLS 정책/인덱스는 변경하지 않았다.
- 신규 주요 파일: src/lib/auth/page-context.ts, src/lib/auth/current-user.ts, src/proxy.ts, src/lib/schedule-overview-server.ts, 서버 page.tsx의 접근자 import, 테스트 스크립트 3개와 SQL 026.
- 이번 수정은 빈 본문의 대기 원인을 줄이는 작업이며 기존 디자인/레이아웃/로딩 표시를 바꾸지 않았다.
- 실제 원격 DB 적용·Vercel 배포·로그인 브라우저 재측정은 하지 못했다. 운영 환경의 본문 표시 시간, 리전 왕복 시간, 헤더 전달과 세션 갱신 동작을 배포 후 확인해야 한다. 운영에서 헤더 전달이 누락돼도 기존 인증 검증으로 돌아가므로 검증을 생략하지 않는다.
