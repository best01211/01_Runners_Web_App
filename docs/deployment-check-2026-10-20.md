# 배포 후 점검 — 2026-10-20

대상: https://01-runners-web-app.vercel.app

## 배포 앱에서 확인

로그인된 관리자 계정으로 다음 조회와 화면 이동을 확인했다.

- 홈: 로그인 유지, 계정 역할, 시즌 및 본인 활동, 예정 일정 빈 상태.
- 일정: 다가오는 일정 빈 상태, 지난 일정 5건, 일정 상세.
- 상세 참가·출석: 비동기 로딩 완료 후 전체 1명, 그룹 1명, 명단 1명 일치. 종료된 출석 및 기존 출석 상태 표시.
- 랭킹: 현재 시즌 2명 조회, 전체 시즌 선택 후 조회 결과 전환.
- 프로필: 기존 정보 및 비밀번호 변경 입력 화면 조회. 저장하지 않음.
- 관리자: 회원 목록, 시즌 목록, 정기런 양식 목록, 운영 설정 조회.
- 가입 승인: 대기 회원 0명 표시.
- 라이브 추적: 기존 대회 목록 조회.
- 확인 시점의 브라우저 오류 로그: 빈 목록.

초기 일정 상세 로딩 중 그룹 인원은 확인 중, 출석 명단은 0명으로 잠시 표시됐고 출석 시작 버튼이 보였다. 데이터 로딩 후 올바른 인원과 출석 종료 상태로 바뀌었다. 잘못된 초기 조작을 방지하는 로딩 UI는 후속 개선 대상으로 남긴다.

## 로컬 검증

아래 14개 테스트 스크립트 모두 종료 코드 0. 이 DB 검증은 로컬 fixture에서 실행했으며 운영 DB 변경 검증이 아니다.

`test:auth`, `test:release`, `test:tracking`, `test:release-db`, `test:stabilization-db`, `test:regular-templates-db`, `test:member-deletion-db`, `test:operational-enums-db`, `test:pace-group-unification-db`, `test:template-groups-db`, `test:restricted-access-db`, `test:service-restrictions-db`, `test:executive-permissions-db`, `test:profile-name-db`.

- 인증 5개, 출시 로직 55개, 추적 로직 30개 통과.
- ESLint 및 `npx tsc --noEmit --incremental false` 통과.
- 개별 실행 로그: Git 제외 경로 `.test-output/deployment-*.log`.

## 검증 범위의 한계

실제 일정 생성·수정·취소, 참가·취소, 출석 입력, 댓글 작성, 회원 승인·삭제, 프로필 저장 및 서비스 상태 변경은 실행하지 않았다. 실제 메일 발송·링크 인증·비밀번호 재설정, 일반 회원 및 비로그인 계정의 운영 환경 권한 검증, 다중 기기 및 모바일 실기기 검증도 수행하지 않았다. 라이브 추적은 목록 조회까지만 확인했다.

조회 요청에는 앱 자체의 자동 출석 마감 RPC가 포함될 수 있다. 수동 쓰기 버튼은 실행하지 않았다.
