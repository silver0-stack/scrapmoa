import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

// Supabase 세션 쿠키를 매 요청마다 갱신한다 (@supabase/ssr 공식 패턴).
// Next.js 16부터 middleware 컨벤션이 proxy로 대체됨.
export async function proxy(request) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request: { headers: request.headers } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 만료된 세션을 여기서 갱신해두지 않으면 서버 컴포넌트에서 세션이 끊길 수 있다.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/kakao-webhook|api/cron).*)",
  ],
};
