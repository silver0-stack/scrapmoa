import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// 서버 컴포넌트/라우트 핸들러에서 사용하는 Supabase 클라이언트.
// 로그인한 사용자의 쿠키 세션을 그대로 사용하므로 RLS가 적용된다.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component에서는 쿠키 쓰기가 불가능하지만,
            // 미들웨어가 세션 쿠키를 갱신해주므로 무시해도 된다.
          }
        },
      },
    }
  );
}
