import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Supabase의 signInWithOAuth(카카오 기본 제공)는 GoTrue가 account_email 스코프를
// 무조건 요청하도록 하드코딩되어 있어(supabase/auth의 kakao.go), 이 동의항목이
// 없는 앱(비즈 앱 전환 전)에서는 KOE205로 로그인 자체가 막힌다.
// 그래서 카카오 인가 코드 발급은 이 앱이 직접 요청(scope에 account_email 미포함)하고,
// 받은 id_token만 signInWithIdToken으로 Supabase에 넘겨 세션을 만든다.
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const kakaoError = searchParams.get("error");

  if (kakaoError || !code) {
    console.error("[auth/kakao/callback] 인가 코드 없음/카카오 에러", kakaoError);
    return NextResponse.redirect(`${origin}/login?error=kakao_auth_failed`);
  }

  try {
    const tokenResponse = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY,
        client_secret: process.env.KAKAO_CLIENT_SECRET,
        redirect_uri: process.env.NEXT_PUBLIC_KAKAO_REDIRECT_URI,
        code,
      }),
    });

    const tokenBody = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenBody.id_token) {
      console.error("[auth/kakao/callback] 토큰 교환 실패", tokenBody);
      return NextResponse.redirect(`${origin}/login?error=kakao_token_failed`);
    }

    const supabase = await createClient();
    const { error: signInError } = await supabase.auth.signInWithIdToken({
      provider: "kakao",
      token: tokenBody.id_token,
    });

    if (signInError) {
      console.error("[auth/kakao/callback] signInWithIdToken 실패", signInError);
      return NextResponse.redirect(`${origin}/login?error=kakao_session_failed`);
    }

    return NextResponse.redirect(`${origin}/dashboard`);
  } catch (error) {
    console.error("[auth/kakao/callback] 처리 중 알 수 없는 오류", error);
    return NextResponse.redirect(`${origin}/login?error=kakao_auth_failed`);
  }
}
