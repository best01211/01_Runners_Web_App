# 대회·종목·그룹과 응원 지점 추적

운영진 선수 등록과 외부 API 연동은 이후 [MyResult 기록 연동](tracking-api-integration.md)으로 확장했다. 이 기능에는 030 마이그레이션이 필요하며 실제 선수 수집은 제공처 API 키 발급 전까지 대기한다.

등록 화면은 이후 [복수 GPX 동시 등록](tracking-multi-course-registration.md)으로 확장했다. 한 번에 여러 종목을 등록하려면 029 마이그레이션까지 적용해야 한다.

## 사용 방법
1. 라이브 추적 → 대회 등록에서 대회 이름과 첫 종목의 이름·공식 거리·출발 시각·GPX를 등록한다.
2. 대회 상세의 ‘같은 대회에 종목 추가’에서 풀코스/10K 등 다른 종목을 추가한다.
3. 각 종목의 ‘관리자 · 코스와 계측 관리’에서 그룹명과 평균 페이스(분·초/km)를 등록한다.
4. 해당 종목 화면에서 회원·배번호·그룹을 함께 등록한다. 다른 종목에 이미 등록된 회원은 중복 등록할 수 없다. 배번호는 종목별로 구분하므로 다른 종목과 같을 수 있다.
5. START·5K 등 실제 통과 기록을 입력한다. 자동 계측 업체 연동과 GPS 수집 기능은 이번 범위에 포함되지 않는다.
6. 선수 행을 누르면 같은 데이터로 선수 기록 화면을 연다. 응원 지점은 지도 클릭 또는 거리 입력으로 설정한다.
7. /tracking/demo에서 가상 시간, 하프/10K, 첫 계측 전후, 중도 포기·미출발·계측 지연을 체험한다. 데모 10K는 보유 GPX 앞부분을 잘라 만든 가상 종목이며 실제 대회 10K 경로가 아니다.

## 구조와 기존 데이터 보존
- 028_tracking_courses_groups.sql을 027까지 적용된 DB에 적용해야 한다. 원격 DB 적용·배포는 수행하지 않았다.
- 기존 tracking_races를 코스 단위로 유지하며 parent_race_id가 없는 첫 코스를 대회의 대표로 사용한다. 추가 코스는 대표 ID를 참조한다. 기존 URL·선수 ID·계측 ID는 바꾸지 않는다. 대회 이름으로 자동 병합하지 않는다.
- 기존 코스는 ‘기본 코스’로 유지한다. 기존 선수는 보유 목표 페이스별 그룹으로 이전하고, 없으면 기존 기본값 360초/km를 사용한다.
- 새 그룹은 추가 방식이며 수정·삭제 API를 제공하지 않는다. 회원에게 할당한 페이스가 나중에 바뀌는 것을 방지한다. 선수 정보는 계측 이후 수정 불가이며 기존 선수의 출발 이후 변경도 차단한다.
- 기존 RLS 정책·회원 자격·관리 권한 함수는 변경하지 않는다. 새 그룹 테이블은 기존 코스 읽기 권한을 사용하는 RLS를 적용한다. 쓰기는 기존 is_tracking_admin() 검증을 거치는 RPC만 허용한다. 기존 RPC 본체를 private helper로 이름을 바꾸고 authenticated/anon/public 실행을 회수한다.
- 대표 대회를 보관하면 모든 종목을 함께 숨긴다. 추가 종목 화면에서는 해당 종목만 보관한다. 기존과 같이 기록은 남기며 영구 삭제 기능이 아니다. 확인 문구와 버튼을 구분했다.
- 한 대회 최대 20종목, 종목별 최대 50그룹·500선수, 선수당 100계측의 제한이 있다.

## 예측 규칙
- 새 그룹 등록 선수는 개인 목표 기록보다 그룹 페이스를 우선한다. 첫 5km 이상 계측이 도착하기 전에는 실제 속도를 안다고 표시하지 않는다.
- 첫 5km 계측 후 실제 START부터의 평균 페이스를 사용한다. START가 없으면 예정 출발 기준으로 계산하고 그 사실을 표시하며 신뢰도는 LOW다.
- 이후 최근 최대 3개 구간의 페이스를 최신부터 0.5/0.3/0.2로 가중 평균한다. 존재하는 가중치 합으로 정규화한다. 유효한 2~20분/km 구간만 사용한다.
- 서버에서 아직 수신되지 않은 기록과 미래·역순·중복·코스 밖 기록은 위치 계산에 사용하지 않는다. 기록이 없거나 마지막 기록 이후 45분이 지나면 위치 추정을 멈추고 도착 예측을 중단한다. 그룹 페이스가 느려 첫 5km에 45분 이상 걸리는 경우도 이 정지 규칙이 적용된다.
- FINISH 실측만 완주로 확정한다. 실제 START가 없는 최종 기록은 넷타임으로 확정하지 않는다. DNF/DNS는 계속 이동시키지 않는다.
- 공식 거리와 GPX 길이가 다르면 공식 거리 기준 진행률을 전체 GPX 길이에 비례해 표시한다. GPX 누락·잘못된 경로·고저차는 자동 교정하지 않는다.

## 응원 지점
- 지도 선택은 코스 150m 이내에서 선분에 투영한다. 위치 근처에 왕복/교차 통과가 여러 개 있으면 누적 거리별 후보를 선택하게 한다. 직접 거리 입력도 지원한다.
- 도착 시각 = 최근 실제 통과 시각 + (응원 거리 − 최근 실제 통과 거리) × 예측 페이스. 기록이 없으면 출발 기준과 그룹 페이스를 사용한다. 출발 전에는 현재 시각이 아니라 예정 출발 시각을 기준으로 한다.
- 실제 후속 계측이 응원 지점 이상이면 ‘통과 확인’, 계산상 지났으면 ‘통과 추정’이다. 응원 장소의 정확한 실제 통과 시각을 확인한 것으로 표시하지 않는다.
- DNF/DNS·계측 지연은 미통과 지점 ETA를 제공하지 않는다. 응원 지점은 현재 화면의 상태이며 DB·다른 사용자와 공유하지 않고 새로고침/종목 전환 시 초기화한다.

## 데이터 로딩과 검증의 범위
- 서버 페이지가 선수·그룹·계측을 초기 데이터로 전달한다. 클라이언트 마운트 시 같은 API를 다시 요청하지 않는다. 상세/응원 화면 전환은 추가 fetch 없이 같은 데이터를 사용한다.
- 15초마다 화면이 보일 때 갱신하며 요청 중복·10초 타임아웃을 제어한다. 쓰기 후에는 한 번 갱신한다. 종목 링크는 무거운 RSC 사전 요청을 줄이기 위해 prefetch=false다.
- 사용자별 공유 TTL 캐시는 추가하지 않았다. API는 기존과 같이 계정·서비스 권한을 매 요청 검증하고 private,no-store로 응답한다. 관리자 숨김 필터와 계측 조회 범위를 유지한다.
- 작은 테스트 fixture에서 선택 코스의 DB 읽기는 6회(코스·선수·회원·종목 목록·그룹·계측)다. 종목/그룹 지원 때문에 기존보다 2개 조회가 추가된다. 독립 조회는 병렬로 실행하며 계측은 1,000개 단위로 페이지 조회한다. 모든 기록을 재조회하는 기존 폴링을 유지하고 변경분 전송이라고 주장하지 않는다.
- 브라우저에서 초기 중복 요청 0회, 상세 전환 추가 요청 0회, 그룹 저장 POST 1회 + 갱신 GET 1회를 검증한다. 이는 로컬 요청 횟수이며 Vercel/실제 Supabase 지연 측정값은 아니다.
- UI 브라우저 검사는 실제 React 컴포넌트·Leaflet과 Next UI shim, 고정 배경 타일을 사용한다. 모바일390px/데스크톱1280px의 가로 넘침, 선수 상세, 응원 ETA, 종목 전환, 첫5km 전환, 관리자 그룹 폼을 확인한다. 실제 인증·Next 라우팅·OSM 통신·iOS 실기기 검증과는 구분한다.

## 실행
- npm run test:tracking
- npm run test:tracking-courses-db (준비: npm install --prefix .test-output/sql-qa --no-save @electric-sql/pglite)
- node scripts/test-tracking-snapshot.mjs
- node scripts/test-tracking-deletion.mjs
- npm run test:tracking-ui-browser / npm run test:tracking-map-browser (준비: npm install --prefix .test-output/map-qa --no-save @playwright/test esbuild)
- npm run lint / npm run build / npm run test:release / npm run test:auth

모바일 QA 스크린샷은 .test-output/tracking-ui/ 아래에 생성한다. 테스트 파일은 Git에서 제외되며 배경 지도 타일을 가짜로 대체한 이미지다.

## 최종 로컬 검증 결과
- npm run build 성공: 컴파일 4.5초, TypeScript 5.0초. 이는 빌드 시간이며 페이지 응답 시간이 아니다.
- ESLint 통과. 추적 엔진·입력·응원 계산 36개, 신규 PostgreSQL 검사 26개 통과.
- 릴리스 테스트 55개, 인증 테스트 5개 통과.
- 스냅샷의 종목 분리·관리자 숨김·그룹 연결·계정 제한·보관 대회 검사 및 삭제 API 회귀 검사 통과.
- 모바일/데스크톱 UI, 초기 요청 0회·상세 전환 추가 요청 0회·그룹 저장 POST+GET 각1회 검사 통과.
- 지도 터치/확대·이동/타일 갱신/크기 변경 회귀 통과. 확대 중 마커 화면 투영 오차 2.01px(실제 위치 예측 정확도를 뜻하지 않는다).
- 실제 Supabase/Vercel 운영 지연, 인증된 전체 브라우저 E2E 및 iPhone/Android 실기기는 미측정이다.

## 주요 변경 파일
- src/app/tracking/page.tsx, [raceId]/page.tsx, new/page.tsx: 대표 대회 목록·초기 데이터·종목 관리 안내.
- src/app/api/tracking/route.ts, [raceId]/route.ts: 종목 생성·그룹 입력·보관 범위·서비스 제한 검증.
- src/components/race-tracking/live-tracking-view.tsx: 사진 없는 현황·선수 기록·응원 도착표.
- src/components/race-tracking/live-tracking.tsx, race-registration-form.tsx, delete-race-button.tsx: 관리자 입력과 보관 확인.
- src/components/race-tracking/tracking-demo.tsx, tracking-map.tsx: 새 화면 데모·응원 지점 선택·지도 높이.
- src/lib/tracking-snapshot-server.ts: 종목·그룹 초기 데이터와 병렬 조회.
- src/lib/race-tracking/engine.ts, cheering.ts, validation.ts, live-types.ts, types.ts: 그룹 전환·응원 계산·입력 검증·모델.
- src/app/globals.css: 기존 색상에 맞춘 진행 막대.
- supabase/migrations/028_tracking_courses_groups.sql: 기존 ID 보존 종목 확장·그룹·RPC 권한.
- tests/race-tracking/*, scripts/test-tracking*.mjs, package.json: 엔진·DB·브라우저·보안 회귀 검사.
