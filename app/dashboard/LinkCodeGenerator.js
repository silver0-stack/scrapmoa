"use client";

import { useState } from "react";

export default function LinkCodeGenerator() {
  const [code, setCode] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generateCode = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/link-code", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "발급에 실패했어요.");
      }
      setCode(data.code);
      setExpiresAt(data.expiresAt);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mt-6 max-w-md rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="font-semibold text-neutral-900">카카오톡 챗봇 연동</h2>
      <p className="mt-1 text-sm text-neutral-500">
        아래에서 코드를 발급받아 카카오톡 챗봇방에 그대로 보내면, 로그인 전에
        저장한 링크까지 이 계정에 연결돼요.
      </p>

      <button
        type="button"
        onClick={generateCode}
        disabled={loading}
        className="mt-3 rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {loading ? "발급 중..." : "연동 코드 발급"}
      </button>

      {code && (
        <p className="mt-4 text-3xl font-bold tracking-[0.3em] text-neutral-900">
          {code}
        </p>
      )}
      {expiresAt && (
        <p className="mt-1 text-xs text-neutral-400">
          {new Date(expiresAt).toLocaleTimeString("ko-KR")}까지 유효 (10분)
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
