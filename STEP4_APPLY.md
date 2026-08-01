# 01Runners 4단계: 일정 CRUD

## 적용

ZIP의 `src` 폴더를 현재 프로젝트의 `src`에 병합합니다. 기존 `schedules` 테이블을 사용하므로 추가 SQL은 없습니다.

```bash
npm run dev
```

## 확인 주소

- 일정 목록: `http://localhost:3000/schedules`
- 일정 생성: `http://localhost:3000/schedules/new`
- 일정 상세: `/schedules/{scheduleId}`
- 일정 수정: `/schedules/{scheduleId}/edit`

## 권한 정책

- admin/staff: 모든 유형 생성·수정 가능
- member: 번개런(`flash`)만 생성 가능
- 번개런 작성자: 본인 일정 수정·취소 가능
- 다른 회원의 일정 수정은 403

## API

- `GET /api/schedules`
- `POST /api/schedules`
- `GET /api/schedules/{scheduleId}`
- `PATCH /api/schedules/{scheduleId}`
- `DELETE /api/schedules/{scheduleId}`

## 테스트

1. runner01로 정기런 생성
2. 목록과 상세 확인
3. 제목 수정
4. Postman으로 DELETE 호출 후 DB에서 `status=cancelled` 확인
5. runner02로 번개런 생성 성공 확인
6. runner02로 정기런 생성 시 403 확인
