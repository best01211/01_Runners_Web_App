import assert from "node:assert/strict";
import test from "node:test";
import { recoveryCredential, validateRecoveryEmail, validateResetPassword } from "../../src/lib/validation/password-recovery";

test("email normalization and malformed input", () => {
  assert.equal(validateRecoveryEmail(" User@Example.com "), "user@example.com");
  for (const value of [null, {}, "bad", "a b@example.com", "a@b", "a".repeat(255) + "@example.com"]) assert.equal(validateRecoveryEmail(value), null);
});
test("password length and required character types", () => {
  for (const value of [null, 12345678, "abc1234", "abcdefgh", "12345678", "a1".repeat(37)]) assert.ok(validateResetPassword(value, value));
  assert.equal(validateResetPassword("abcd1234", "abcd1234"), null);
  assert.equal(validateResetPassword("a1".repeat(36), "a1".repeat(36)), null);
});
test("password confirmation must match exactly", () => {
  assert.ok(validateResetPassword("abcd1234", "abcd1234 "));
  assert.ok(validateResetPassword("abcd1234", undefined));
});
test("existing login without recovery credential cannot authorize reset", () => {
  assert.equal(recoveryCredential({}), null);
  assert.equal(recoveryCredential({ type: "recovery" }), null);
  assert.equal(recoveryCredential({ type: "signup", tokenHash: "token" }), null);
});
test("recovery token, PKCE code and complete session credentials", () => {
  assert.deepEqual(recoveryCredential({ type: "recovery", tokenHash: "token" }), { kind: "token-hash", tokenHash: "token" });
  assert.deepEqual(recoveryCredential({ type: "recovery", code: "code" }), { kind: "code", code: "code" });
  assert.deepEqual(recoveryCredential({ type: "recovery", accessToken: "access", refreshToken: "refresh" }), { kind: "session", accessToken: "access", refreshToken: "refresh" });
  assert.equal(recoveryCredential({ type: "recovery", accessToken: "access" }), null);
  assert.equal(recoveryCredential({ type: "recovery", tokenHash: "a".repeat(8193) }), null);
});
