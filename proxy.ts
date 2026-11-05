import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  // 세션 토큰을 확인·갱신한다. 이 호출과 createServerClient 사이에 다른 코드를 넣지 않는다.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 분할점수 페이지(/cutoff)는 링크만 있으면 로그인 없이 쓴다. 관리자 전용 탭은 화면에서 숨기고, 올리기는 DB 규칙(RLS)이 관리자만 허용한다.
  // 자리 배치표(/)와 나머지는 로그인이 필요하고, 관리자가 아니면 /cutoff로 보낸다(app/page.tsx).
  const path = request.nextUrl.pathname;
  const isLoginPage = path.startsWith("/login");
  const isPublic = isLoginPage || path === "/cutoff" || path.startsWith("/cutoff/");
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/cutoff";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/keepalive|hwpx/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
