# 실제 운영 ENUM 호환 수정

제공된 열 조회 CSV에서 일정 상태는 `draft, open, closed, in_progress, completed, cancelled`, 참가 등록 출처는 `user, manager, system`으로 확인됐다.

009의 출석 함수는 존재하지 않는 `attendance_open` / `attendance_closed`를 저장하고, 번개런 자동 참가 함수는 등록 출처 `creator`를 저장했다. 기존 로컬 fixture의 해당 열이 text여서 이 차이를 검증하지 못했다.

`012_operational_enum_compatibility.sql`을 실행하면 출석 시작은 `in_progress`, 종료는 `completed`로 저장하고, 번개런 자동 등록 출처는 `system`으로 저장한다. ENUM과 기존 데이터는 변경하지 않고 해당 함수만 교체한다. 반복 적용 가능하다.

운영 ENUM과 같은 타입을 사용하는 새 검증에서는 기존 출석 시작·번개런 생성 오류를 재현했으며, 수정 이후 운영진/회원 참가 신청, 출석 시작·인증·종료, 출석 후 취소 차단 및 번개런 자동 참가가 통과했다.

이 결과가 실제 운영 DB의 정기런 참가 오류 원인을 확정하는 것은 아니다. 조회된 참가 열·상태값·등록 출처는 현재 신청 함수와 일치한다. 012 적용 후에도 신청이 실패하면 운영진 화면의 RPC 오류 코드·메시지와 진단 SQL의 2번 제약조건 / 3번 트리거 결과를 기준으로 추가 원인을 확인해야 한다.
