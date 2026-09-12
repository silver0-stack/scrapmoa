import { createClient } from "@supabase/supabase-js";

// 서버 전용 관리자 클라이언트 (RLS 우회, service role key 사용).
// 웹훅/크론 등 신뢰된 서버 로직에서만 사용하고 절대 클라이언트에 노출하지 않는다.
export function createAdminClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}
