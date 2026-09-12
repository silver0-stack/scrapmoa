import { createBrowserClient } from "@supabase/ssr";

// 클라이언트 컴포넌트(브라우저)에서 사용하는 Supabase 클라이언트.
// RLS가 적용된 채로 로그인한 사용자 권한으로 동작한다.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
