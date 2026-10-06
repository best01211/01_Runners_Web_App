# 비밀번호 재설정

로그인 화면 → 비밀번호를 잊으셨나요? → 가입 이메일 입력 → 메일 링크 → 새 비밀번호 입력 → 다시 로그인.

- `/auth/forgot-password`: 이메일 요청
- `/auth/reset-password`: 새 비밀번호 입력
- `POST /api/auth/password-recovery`: Supabase 메일 발송 요청
- `POST /api/auth/reset-password`: 인증 링크 확인 후 비밀번호 변경

기존 비밀번호는 조회·복호화하지 않는다. 기존 로그인, 승인 상태, 역할, 계정 상태는 변경하지 않는다.
회원가입과 같은 영문·숫자 포함 8~72자 정책을 적용한다.
계정 존재 여부는 이메일 요청 응답에서 공개하지 않는다. 발송 제한은 Supabase Auth 정책에 따른다.
비밀번호 변경 API는 기존 로그인 세션만으로 실행하지 않고 이메일 링크의 token_hash, 인증 code 또는 유효한 토큰 쌍을 검증한다.
Supabase 관리자 키로 비밀번호를 덮어쓰지 않는다. 인증은 프로젝트의 공개 키와 Supabase Auth로 처리한다.
메일 링크 확인은 폼 제출 시 실행하여 메일 스캐너의 페이지 GET이 일회용 토큰을 소비하지 않도록 한다.
로그인 상태와 관계없이 복구 페이지에 접근할 수 있으며, 비밀번호 변경 후 다시 로그인해야 한다.

## Supabase 설정

개발 중에는 Authentication의 URL Configuration에서 다음을 등록한다.

- Site URL: `http://localhost:3000`
- Redirect URLs: `http://localhost:3000/auth/reset-password`

운영에서는 실제 HTTPS 주소로 설정한다.
기본 메일 템플릿의 ConfirmationURL 방식은 앱에서 요청한 redirectTo로 이동하며 토큰 fragment를 처리한다.
직접 Dashboard의 Send password recovery를 사용하는 경우에는 Site URL로 이동하므로 아래 커스텀 템플릿을 권장한다.

Authentication → Email Templates → Reset Password의 링크:

```html
<a href="{{ .SiteURL }}/auth/reset-password#token_hash={{ .TokenHash }}&type=recovery">비밀번호 재설정</a>
```

이 형태는 다른 브라우저에서도 사용할 수 있고 토큰을 서버 URL 로그에 노출하지 않는다.
기존 `?token_hash=...&type=recovery` 형식도 지원한다.
이 앱에서 변경한 것은 코드이며 Supabase 대시보드 설정·메일 템플릿은 자동 변경하지 않았다.

링크가 만료·사용되었거나 새로고침으로 입력 중인 인증 정보가 사라졌다면 메일을 다시 요청한다.
메일 발송 실패가 계속되면 Supabase 발송 제한·SMTP·URL 설정을 확인한다.
사용자 이메일로 메일을 보내거나 실제 비밀번호를 바꾸는 검증은 사용자가 직접 수행한다.

## 검증

`npm run test:auth`, `npm run lint`, `npx tsc --noEmit --incremental false`, `npm run build`.
