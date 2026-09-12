import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const CODE_TTL_MINUTES = 10;
const MAX_INSERT_ATTEMPTS = 5;
const UNIQUE_VIOLATION = "23505";

function generateSixDigitCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();

  for (let attempt = 0; attempt < MAX_INSERT_ATTEMPTS; attempt++) {
    const code = generateSixDigitCode();
    const { error } = await supabase.from("link_codes").insert({
      code,
      user_id: user.id,
      expires_at: expiresAt,
      used: false,
    });

    if (!error) {
      return NextResponse.json({ code, expiresAt });
    }

    if (error.code !== UNIQUE_VIOLATION) {
      console.error("[link-code] 발급 실패", error);
      return NextResponse.json({ error: "코드 발급에 실패했어요." }, { status: 500 });
    }
    // 23505(code 중복)면 다른 코드로 재시도
  }

  console.error("[link-code] 코드 중복으로 재시도 한도 초과");
  return NextResponse.json(
    { error: "코드 발급에 실패했어요. 다시 시도해주세요." },
    { status: 500 }
  );
}
