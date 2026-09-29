"use client";

import { useState } from "react";
import Footer from "../components/Footer";

const KAKAO_AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize";
// account_email은 요청하지 않는다 (비즈 앱 전환 없이는 카카오가 KOE205로 거부함).
const KAKAO_SCOPES = "openid profile_nickname profile_image";
const KAKAO_CHANNEL_URL = "https://pf.kakao.com/_hmXrX";

const STEPS = [
  { title: "카카오톡 채널 추가", description: "\"스크랩모아\" 채널을 추가해요." },
  { title: "링크 붙여넣기", description: "채팅방에 저장하고 싶은 링크를 보내면 자동 저장돼요." },
  { title: "로그인해서 모아보기", description: "여기서 로그인하면 저장한 링크를 검색·정리할 수 있어요." },
];

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
    <main className="flex min-h-screen flex-col bg-neutral-50 px-4">
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <div className="text-center">
          <img src="/logo.svg" alt="" className="mx-auto h-14 w-14 rounded-2xl" />
          <h1 className="mt-3 text-2xl font-bold text-neutral-900">스크랩모아</h1>
          <p className="mt-2 text-sm text-neutral-500">
            카카오톡 채널에 링크를 던지면, AI가 요약해서 모아드려요.
          </p>
        </div>

        <ol className="w-full max-w-xs space-y-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex items-start gap-3">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-neutral-200 text-xs font-semibold text-neutral-600">
                {index + 1}
              </span>
              <div>
                <p className="text-sm font-medium text-neutral-900">{step.title}</p>
                <p className="text-xs text-neutral-500">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="flex flex-col items-center gap-3">
          <a
            href={KAKAO_CHANNEL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-neutral-300 bg-white px-6 py-3 text-sm font-semibold text-neutral-800"
          >
            카카오톡 채널 추가하기
          </a>

          <button
            type="button"
            onClick={handleLogin}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-[#FEE500] px-6 py-3 text-sm font-semibold text-black disabled:opacity-60"
          >
            {loading ? "이동 중..." : "카카오로 로그인"}
          </button>
        </div>
      </div>

      <Footer />
    </main>
  );
}
