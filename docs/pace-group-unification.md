# 참가 페이스 그룹 테이블 통일

실제 운영 조회 결과에서 앱과 009 참가 RPC는 `pace_groups`를 사용하지만, 기존 `validate_participation_pace_group` 트리거와 참가 외래키는 `schedule_pace_groups`를 참조했다. ‘양식 test’의 6:00/5km 그룹은 올바른 일정에 연결되어 있었으므로 그룹 선택 문제가 아니라 검증 기준 테이블의 불일치였다.

012 적용 후 `013_unify_participation_pace_groups.sql` 전체를 SQL Editor에서 실행한다. 트리거와 외래키를 `pace_groups`로 통일하며 다른 일정의 그룹은 계속 거절한다. 참가 기록과 기존 legacy 테이블은 삭제하지 않는다.

기존 참가가 legacy 그룹을 참조한다면 해당 그룹을 가져오거나 같은 일정·페이스·거리의 canonical 그룹 ID로 연결한다. legacy 필드가 `pace_seconds`/`distance_km`과 호환되지 않거나 기존 참가의 일정 연결이 잘못됐다면 전체 변경을 취소한다. 오류 메시지를 확인하고 실제 legacy 스키마를 기준으로 추가 처리해야 한다. 임의의 기본값을 채우거나 검증을 제거하지 않는다.

로컬 PostgreSQL fixture에서 운영 트리거·외래키 충돌을 재현했다. 수정 후 legacy 참조의 보존·ID 통합·그룹 가져오기·반복 적용·신규 참가 저장·다른 일정 그룹의 거절·참조 중인 그룹 삭제 차단을 검증했다. 운영 DB 적용은 사용자가 진행해야 한다.
