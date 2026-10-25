# 취소 일정 영구 삭제 오류 수정

037에서 추가한 `member_notifications`는 일정과 댓글을 참조하지만, 기존 `delete_schedule_tree`의 허용 목록에는 없었습니다. 삭제 함수는 행 수 확인보다 먼저 테이블을 검증하므로 알림이 없는 일정도 `UNSUPPORTED_SCHEDULE_DEPENDENCY`로 실패합니다.

Supabase SQL Editor에서 `supabase/migrations/038_schedule_delete_notifications.sql`을 적용한 뒤 앱을 배포합니다. 이미 배포된 앱도 SQL 적용 후 기존 영구 삭제 버튼으로 재시도할 수 있습니다. 이번 작업은 운영 데이터나 운영 DB를 직접 변경하지 않았습니다.

038은 알림 테이블만 삭제 대상 허용 목록에 추가합니다. 기존 관리자 권한, 취소 일정 제한, 확인 문구, 트랜잭션 전체 롤백, 알 수 없는 종속 테이블 차단을 유지합니다. 영구 삭제 실행 시 해당 일정·댓글의 알림도 함께 정리하며, 다른 일정의 알림과 기록은 유지합니다.

`npm run test:schedule-admin-db`에서 기존 함수의 빈 알림 테이블 실패를 재현하고, 수정 후 알림이 있는 일정 삭제 및 인접 일정 보존을 포함해 33개 검사를 통과했습니다. API도 확인 문구 오류·권한·DB 업데이트 필요 상태를 구분해 안내합니다.

## 운영 DB 진단 후 추가 수정: 039

사용자가 제공한 운영 DB FK 결과에서 `schedules → attendance_sessions → attendance_records` 구조를 확인했습니다. `attendance_records`는 기존 허용 목록에 있었지만 `attendance_sessions`가 누락되어 038 적용 후에도 삭제가 실패합니다. 이 경로는 과거 경량 테스트 스키마에도 없어 이전 검증에서 놓쳤습니다.

Supabase SQL Editor에서 `supabase/migrations/039_schedule_delete_attendance_sessions.sql` 전체를 실행합니다. 038의 알림 수정도 포함합니다. 이 SQL은 삭제 함수 정의만 갱신하며 자체적으로 데이터를 삭제하지 않습니다. 기존 배포 앱의 영구 삭제 버튼을 다시 누르면 수정된 함수를 사용하므로 이번 SQL 수정을 위해 Git을 먼저 재배포할 필요는 없습니다.

운영 구조를 반영한 `test:schedule-admin-db` 42개 검사 통과: 038 상태에서 빈 출석 세션 테이블만으로 실패 재현, 039 적용 후 세션·기록·알림 삭제, 다른 일정의 데이터 유지, 알 수 없는 연결 테이블 차단 및 전체 롤백, 기존 관리자·취소 상태·확인 문구 제한 유지. 운영 DB 적용과 실제 삭제는 아직 수행하지 않았습니다.
