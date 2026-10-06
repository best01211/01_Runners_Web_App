export function validateRecoveryEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
export function validateResetPassword(password: unknown, confirmation: unknown): string | null {
  if (typeof password !== "string" || password.length < 8 || password.length > 72 ||
    !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "비밀번호는 영문과 숫자를 포함한 8~72자로 입력해주세요.";
  }
  return password === confirmation ? null : "비밀번호 확인이 일치하지 않습니다.";
}
export type RecoveryCredential =
  | { kind: "token-hash"; tokenHash: string }
  | { kind: "code"; code: string }
  | { kind: "session"; accessToken: string; refreshToken: string };
export function recoveryCredential(body: Record<string, unknown>): RecoveryCredential | null {
  const valid = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 8192;
  if (body.type !== "recovery") return null;
  if (valid(body.tokenHash)) return { kind: "token-hash", tokenHash: body.tokenHash };
  if (valid(body.code)) return { kind: "code", code: body.code };
  if (valid(body.accessToken) && valid(body.refreshToken)) return {
    kind: "session", accessToken: body.accessToken, refreshToken: body.refreshToken,
  };
  return null;
}
