# 취소 일정 영구 삭제 오류 수정

037에서 추가한 `member_notifications`는 일정과 댓글을 참조하지만, 기존 `delete_schedule_tree`의 허용 목록에는 없었습니다. 삭제 함수는 행 수 확인보다 먼저 테이블을 검증하므로 알림이 없는 일정도 `UNSUPPORTED_SCHEDULE_DEPENDENCY`로 실패합니다.

Supabase SQL Editor에서 `supabase/migrations/038_schedule_delete_notifications.sql`을 적용한 뒤 앱을 배포합니다. 이미 배포된 앱도 SQL 적용 후 기존 영구 삭제 버튼으로 재시도할 수 있습니다. 이번 작업은 운영 데이터나 운영 DB를 직접 변경하지 않았습니다.

038은 알림 테이블만 삭제 대상 허용 목록에 추가합니다. 기존 관리자 권한, 취소 일정 제한, 확인 문구, 트랜잭션 전체 롤백, 알 수 없는 종속 테이블 차단을 유지합니다. 영구 삭제 실행 시 해당 일정·댓글의 알림도 함께 정리하며, 다른 일정의 알림과 기록은 유지합니다.

`npm run test:schedule-admin-db`에서 기존 함수의 빈 알림 테이블 실패를 재현하고, 수정 후 알림이 있는 일정 삭제 및 인접 일정 보존을 포함해 33개 검사를 통과했습니다. API도 확인 문구 오류·권한·DB 업데이트 필요 상태를 구분해 안내합니다.
