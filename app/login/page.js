"use client";

import { useState } from "react";

const KAKAO_AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize";
// account_email은 요청하지 않는다 (비즈 앱 전환 없이는 카카오가 KOE205로 거부함).
const KAKAO_SCOPES = "openid profile_nickname profile_image";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);

  const handleLogin = () => {
    setLoading(true);
    const params = new URLSearchParams({
      client_id: process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY,
      redirect_uri: process.env.NEXT_PUBLIC_KAKAO_REDIRECT_URI,
      response_type: "code",
      scope: KAKAO_SCOPES,
    });
    window.location.href = `${KAKAO_AUTHORIZE_URL}?${params.toString()}`;
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-neutral-50 px-4">
      <div className="text-center">
        <img src="/logo.svg" alt="" className="mx-auto h-14 w-14 rounded-2xl" />
        <h1 className="mt-3 text-2xl font-bold text-neutral-900">스크랩모아</h1>
        <p className="mt-2 text-sm text-neutral-500">
          카카오톡으로 저장한 링크를 대시보드에서 모아보세요.
        </p>
      </div>

      <button
        type="button"
        onClick={handleLogin}
        disabled={loading}
        className="flex items-center gap-2 rounded-lg bg-[#FEE500] px-6 py-3 text-sm font-semibold text-black disabled:opacity-60"
      >
        {loading ? "이동 중..." : "카카오로 로그인"}
      </button>
    </main>
  );
}
