import { test } from "node:test";
import assert from "node:assert/strict";
import { describeAuthError } from "./authErrors.ts";

test("이메일 미확인과 잘못된 정보를 구분한다", () => {
  assert.match(describeAuthError({ code: "email_not_confirmed", message: "Email not confirmed", status: 400 }, "signin"), /이메일 확인을 하지 않았/);
  assert.match(describeAuthError({ message: "Email not confirmed" }, "signin"), /이메일 확인을 하지 않았/);
  const bad = describeAuthError({ code: "invalid_credentials", message: "Invalid login credentials", status: 400 }, "signin");
  assert.match(bad, /맞지 않아요/);
  assert.ok(!bad.includes("확인을 하지 않았"));
  assert.match(describeAuthError({ message: "Invalid login credentials" }, "signin"), /맞지 않아요/);
});

test("가입 오류: 이미 가입, 약한 비밀번호, 잘못된 이메일, 가입 불가", () => {
  assert.match(describeAuthError({ code: "user_already_exists" }, "signup"), /이미 가입/);
  assert.match(describeAuthError({ message: "User already registered" }, "signup"), /이미 가입/);
  assert.match(describeAuthError({ code: "weak_password" }, "signup"), /너무 약해요/);
  assert.match(describeAuthError({ message: "Password should be at least 8 characters" }, "signup"), /너무 약해요/);
  assert.match(describeAuthError({ code: "email_address_invalid" }, "signup"), /형식이 올바르지/);
  assert.match(describeAuthError({ code: "signup_disabled" }, "signup"), /새 계정을 만들 수 없어요/);
});

test("요청 제한, 연결 실패, 서버 오류", () => {
  assert.match(describeAuthError({ code: "over_email_send_rate_limit", status: 429 }, "signup"), /확인 메일을 너무 자주/);
  assert.match(describeAuthError({ code: "over_request_rate_limit", status: 429 }, "signin"), /시도가 너무 많아요/);
  assert.match(describeAuthError({ status: 429 }, "signin"), /시도가 너무 많아요/);
  assert.match(describeAuthError({ name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 }, "signin"), /서버에 연결하지 못했어요/);
  assert.match(describeAuthError({ message: "NetworkError when attempting to fetch resource." }, "signin"), /서버에 연결하지 못했어요/);
  assert.match(describeAuthError({ status: 503, message: "x" }, "signin"), /서버에 문제가 있어요/);
  assert.match(describeAuthError({ name: "AuthRetryableFetchError", status: 503, message: "x" }, "signin"), /서버에 문제가 있어요/);
});

test("알 수 없는 오류는 오류 코드를 덧붙여 보여준다", () => {
  assert.equal(describeAuthError({ code: "weird_code", status: 400 }, "signin"), "로그인하지 못했어요. (오류: weird_code)");
  assert.equal(describeAuthError({ message: "something" }, "signup"), "가입하지 못했어요. (오류: something)");
  assert.equal(describeAuthError({}, "signin"), "로그인하지 못했어요.");
});
