# 복수 GPX 동시 등록

대회 등록 화면에서 ‘종목 추가’로 여러 종목을 구성한다. 각 종목은 이름, 공식 거리, 출발 시각, GPX/GeoJSON을 별도로 가진다. 풀코스 버튼은 42.195km, 10K 버튼은 10km를 설정하며 직접 수정할 수 있다. 한 파일을 여러 종목의 경로로 자동 추정하지 않는다.

## 변경 파일
- src/components/race-tracking/race-registration-form.tsx: 종목 카드 추가·제거, 종목별 파일과 출발 시간, 거리 빠른 설정.
- src/lib/race-tracking/registration.ts: 공통 등록 검증과 크기 제한.
- src/app/api/tracking/route.ts: 복수 등록은 create_tracking_event 한 번 호출. 기존 단일 등록 요청도 호환한다.
- src/app/tracking/new/page.tsx: 복수 등록과 029 적용 안내.
- supabase/migrations/029_tracking_multi_course_registration.sql: 기존 권한 검사와 코스 검증 함수를 재사용하는 원자적 등록 RPC. 두 번째 코스가 실패하면 첫 번째 코스도 롤백한다. 기존 대회에 여러 종목을 추가할 때도 같은 규칙이다.
- tests/race-tracking/validation.test.ts, scripts/test-tracking-courses-database.mjs, scripts/test-tracking-registration.mjs, scripts/test-tracking-ui-browser.mjs: 등록 검증·롤백·권한·실제 폼 회귀 검사.

## 제한과 보안
- 원본 파일은 종목별 10MB까지 브라우저에서 읽는다. 화면의 기존 2MB 제한을 완화했다. HTTP로 원본 XML 전체를 올리지는 않고 경로 좌표만 전송한다.
- 좌표는 종목별 20,000개, 한 요청은 UTF-8 기준 3.5MB까지다. 큰 원본 파일이어도 좌표가 과도하면 별도 안내가 나온다. 경로를 임의로 단순화하지 않는다.
- 한 대회 최대 20종목이며 전체 전송 크기를 넘으면 등록 후 상세 화면에서 나누어 추가할 수 있다.
- 기존 RLS·관리 권한·회원 상태·점검 제한을 유지한다. 새 RPC도 기존 is_tracking_admin()을 검사하고 anon/public 실행을 허용하지 않는다.
- 028까지 적용된 DB에 029를 적용해야 한다. 원격 DB와 Vercel에는 적용하지 않았다.

## 로컬 검증
- npm run build 성공(컴파일 3.3초, 타입 검사 4.9초), npm run lint, npx tsc --noEmit 통과.
- npm run test:tracking: 38개 통과.
- node scripts/test-tracking-courses-database.mjs: 35개 통과. 다른 GPX·거리·출발 시간 저장, 신규/기존 대회에 대한 중간 실패 롤백, 중복 종목·권한 차단을 포함한다.
- node scripts/test-tracking-registration.mjs: 20개 통과. 인증·권한·서비스 제한·중복 검증·크기 제한·기존 단일 요청 호환을 포함한다.
- node scripts/test-tracking-ui-browser.mjs: 모바일에서 풀코스+10K 파일 입력, 2.1MB GPX 읽기, 출발 시간 구분, 한 번의 등록 요청, 가로 넘침 없음 확인. 가상 GPX이며 실제 춘천 코스 데이터나 운영 계정 E2E는 아니다.
