# 3단계 적용 순서

1. Supabase SQL Editor에서 `supabase/migrations/003_member_approval.sql` 실행
2. 개발용 최초 관리자 생성을 위해 `supabase/bootstrap/001_promote_first_admin.sql` 1회 실행
3. 압축의 `src` 폴더를 프로젝트 `src`에 병합
4. 기존 `src/middleware.ts` 삭제
5. 새 `src/proxy.ts` 사용
6. `npm run dev` 재실행
7. runner01 재로그인 후 `/dashboard` 접속
8. runner02 같은 새 계정을 회원가입
9. runner02는 `/pending`으로 이동하는지 확인
10. runner01로 `/staff/members/pending`에서 runner02 승인

Next.js 16 경고를 제거하기 위해 middleware 대신 proxy 규칙을 사용한다.
