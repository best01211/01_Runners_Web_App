# 로그인 후 리디렉션 반복 복구

2026-10-23 외부 점검에서 배포 주소의 DNS, 로그인 페이지, JS/CSS 파일은 정상 응답했다. 격리된 PC·모바일 브라우저에서도 로그인 화면이 표시됐고 JavaScript 오류와 요청 실패는 없었다. 로그인된 운영 세션과 원격 DB 적용 상태는 확인하지 못했다.

## 코드에서 확인한 경로

031 컬럼을 명시적으로 조회하므로 미적용 DB에서는 `profiles.admin_account` 또는 `profiles.admin_mode_normal` 누락 오류가 난다. 기존 프록시는 프로필 쿼리 오류를 프로필 없음으로 처리해 `/pending`으로 보내고, 해당 페이지는 현재 프로필 조회 실패로 `/login`으로 보냈다. 로그인 세션이 남아 있으면 이 이동을 반복한다. 실제 회원 프로필이 없는 경우에도 같은 반복 경로가 있었다. 이 조건은 로컬에서 재현·검증했다. 운영 장애의 동일 원인 여부는 운영 DB 확인이 필요하다.

## 복구

Supabase SQL Editor에서 아래 읽기 전용 쿼리로 확인할 수 있다.

```sql
select column_name
from information_schema.columns
where table_schema='public' and table_name='profiles'
  and column_name in ('admin_account','admin_mode_normal');
```

두 컬럼이 없으면 `supabase/migrations/031_administrator_modes.sql`을 먼저 적용한다. 일부만 존재하면 임의로 컬럼을 추가하거나 전체 SQL을 반복하기보다 이전 실행 오류와 트랜잭션 상태를 확인한다. 저장소의 031은 트랜잭션으로 실행되므로 정상 실행 시 두 컬럼과 권한 함수가 함께 적용된다.

이번 수정 배포 후에는 누락된 모드 컬럼 오류(42703/PGRST204와 정확한 컬럼명)일 때만 기존 프로필 컬럼으로 재조회한다. DB에서 읽은 실제 역할·승인·활성·탈퇴·점검 검증은 유지한다. 모드 컬럼을 읽지 못한 경우 전환 버튼을 숨긴다. 다른 쿼리 오류와 실제 프로필 없음은 503으로 처리하며 로그인으로 반복 이동시키지 않는다. 회원 목록·상세 조회도 동일하게 호환한다. 기존 RLS는 수정하지 않는다.

미적용 상태에서는 프로필 조회가 한 번 더 발생하므로 호환 처리만으로 계속 운영하기보다 031을 정상 적용해야 한다. 원격 DB 적용·배포는 이번 로컬 수정 작업에 포함되지 않는다.

## 검증

- `npm run test:page-context`: 컬럼 누락 복구, 누락 상태의 정지 계정 차단, 일반 권한 오류/실제 프로필 없음의 503 및 비리디렉션, 정확한 오류에만 재조회, 기존 서명·세션·점검 검사.
- `npm run test:administrator-modes`: 관리자 권한과 DB 보호.
- `node scripts/test-admin-directory.mjs`, `node scripts/test-member-directory.mjs`: 회원 조회 권한과 상세/CSV 회귀.
- `npm run test:release`, `npm run lint`, `npm run build`.
