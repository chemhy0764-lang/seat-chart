import { createClient } from "@supabase/supabase-js";

// Supabase 무료 플랜은 일정 기간 접속이 없으면 프로젝트를 일시 중지한다.
// Vercel Cron(vercel.json)이 하루에 한 번 이 경로를 호출해 데이터베이스에 가벼운 요청을 보낸다.
// 로그인이 필요 없고(proxy.ts에서 제외), 공개용 키로 1을 돌려주는 함수만 부른다.
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const noStore = { "Cache-Control": "no-store" };
  if (!url || !key) {
    return Response.json({ ok: false, error: "missing_env" }, { status: 500, headers: noStore });
  }
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await supabase.rpc("ping");
  if (error) {
    // 자세한 내용은 밖으로 내보내지 않고 오류 코드만 알린다.
    return Response.json({ ok: false, error: error.code || "request_failed" }, { status: 502, headers: noStore });
  }
  return Response.json({ ok: true }, { headers: noStore });
}
