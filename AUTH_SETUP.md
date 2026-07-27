# 01Runners 인증 적용

1. `npm install @supabase/supabase-js @supabase/ssr`
2. 압축의 `src`를 현재 Next.js 프로젝트에 병합
3. `.env.local.example`을 참고해 `.env.local` 생성
4. Supabase Authentication → URL Configuration에 다음 등록
   - Site URL: `http://localhost:3000`
   - Redirect URL: `http://localhost:3000/auth/callback`
5. `npm run dev`

## 회원가입 테스트

```bash
curl -X POST http://localhost:3000/api/auth/signup -H "Content-Type: application/json" -d '{"loginId":"runner01","email":"runner01@example.com","password":"password123!","passwordConfirm":"password123!","name":"홍길동","nickname":"길동러너","phone":"010-1234-5678","birthDate":"2001-01-01"}'
```

## 로그인 테스트

```bash
curl -i -c cookies.txt -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"loginId":"runner01","password":"password123!"}'
curl -b cookies.txt http://localhost:3000/api/auth/me
```

`SUPABASE_SERVICE_ROLE_KEY`에는 절대 `NEXT_PUBLIC_` 접두사를 붙이지 말고 Git에 커밋하지 않는다.
