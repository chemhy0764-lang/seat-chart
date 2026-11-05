// Supabase 로그인·가입 오류를 선생님이 이해할 수 있는 한국어 안내로 바꾼다.
// Supabase는 이메일이 없는 경우와 비밀번호가 틀린 경우를 같은 오류(invalid_credentials)로 돌려줘서 둘을 구분할 수 없다.

export type AuthErrorLike = { code?: string; message?: string; status?: number; name?: string };
export type AuthMode = "signin" | "signup";

export function describeAuthError(err: AuthErrorLike, mode: AuthMode): string {
  const code = err.code ?? "";
  const msg = err.message ?? "";
  const status = err.status;

  if (code === "email_not_confirmed" || /email not confirmed/i.test(msg)) {
    return "아직 이메일 확인을 하지 않았어요. 가입할 때 받은 메일(스팸함도 확인)의 링크를 누른 뒤 다시 로그인해 주세요.";
  }
  if (code === "invalid_credentials" || /invalid login credentials/i.test(msg)) {
    return "이메일 또는 비밀번호가 맞지 않아요. 가입한 적이 없다면 아래 '계정 만들기'를 눌러 주세요.";
  }
  if (code === "user_already_exists" || /already (been )?registered/i.test(msg)) {
    return "이미 가입된 이메일이에요. '로그인하기'로 돌아가 로그인해 주세요.";
  }
  if (code === "weak_password" || /password (should|must)|weak password/i.test(msg)) {
    return "비밀번호가 너무 약해요. 8자 이상으로, 쉬운 숫자 나열이나 흔한 단어는 피해 주세요.";
  }
  if (code === "email_address_invalid" || /email address.*invalid/i.test(msg)) {
    return "이메일 주소 형식이 올바르지 않아요.";
  }
  if (code === "signup_disabled" || /signups? (not allowed|are disabled)/i.test(msg)) {
    return "지금은 새 계정을 만들 수 없어요. 관리자에게 문의해 주세요.";
  }
  if (code === "over_email_send_rate_limit") {
    return "확인 메일을 너무 자주 보냈어요. 잠시(몇 분) 뒤에 다시 시도해 주세요.";
  }
  if (code === "over_request_rate_limit" || status === 429) {
    return "시도가 너무 많아요. 잠시 뒤에 다시 시도해 주세요.";
  }
  // 상태 코드가 5xx면 서버 문제다(Supabase 클라이언트는 502~504도 '연결 오류'로 분류해서 이름만으로는 구분할 수 없다).
  if (typeof status === "number" && status >= 500) {
    return "서버에 문제가 있어요. 잠시 뒤에 다시 시도해 주세요.";
  }
  if (err.name === "AuthRetryableFetchError" || status === 0 || /failed to fetch|network|load failed/i.test(msg)) {
    return "서버에 연결하지 못했어요. 인터넷 연결을 확인하고 잠시 뒤 다시 시도해 주세요. 계속되면 관리자에게 알려 주세요.";
  }
  const detail = code || msg;
  const base = mode === "signin" ? "로그인하지 못했어요." : "가입하지 못했어요.";
  return detail ? `${base} (오류: ${detail})` : base;
}
