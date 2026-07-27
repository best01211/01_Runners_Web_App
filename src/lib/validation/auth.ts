export function validateSignup(body: Record<string, unknown>) {
  const value = {
    loginId: String(body.loginId ?? "").trim(),
    email: String(body.email ?? "").trim().toLowerCase(),
    password: String(body.password ?? ""),
    passwordConfirm: String(body.passwordConfirm ?? ""),
    name: String(body.name ?? "").trim(),
    nickname: String(body.nickname ?? "").trim() || null,
    phone: String(body.phone ?? "").trim() || null,
    birthDate: String(body.birthDate ?? "").trim(),
  };
  if (!/^[A-Za-z0-9_]{4,30}$/.test(value.loginId)) return { error: "아이디는 영문, 숫자, 밑줄을 사용해 4~30자로 입력해 주세요." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) return { error: "올바른 이메일을 입력해 주세요." };
  if (value.password.length < 8 || value.password.length > 72) return { error: "비밀번호는 8~72자로 입력해 주세요." };
  if (value.password !== value.passwordConfirm) return { error: "비밀번호 확인이 일치하지 않습니다." };
  if (value.name.length < 2 || value.name.length > 50) return { error: "이름은 2~50자로 입력해 주세요." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.birthDate) || Number.isNaN(Date.parse(value.birthDate))) return { error: "생년월일은 YYYY-MM-DD 형식으로 입력해 주세요." };
  return { value };
}
