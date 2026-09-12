import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processLinks } from "@/lib/linkProcessor";

export const runtime = "nodejs";
export const maxDuration = 60;

// 웹훅의 waitUntil 처리가 아직 끝나지 않았을 수 있으니, 생성된 지 얼마 안 된
// pending 레코드는 건드리지 않고 일정 시간 이상 방치된 것만 재처리 대상으로 삼는다.
const STALE_MINUTES = 3;
// 1회 실행(maxDuration 60s) 안에서 Gemini 호출 간격(4.5초)을 감안한 안전한 처리 개수.
const BATCH_LIMIT = 10;

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error("[cron/process-links] 인증 실패");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const staleBefore = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString();

  const { data: pendingLinks, error } = await supabase
    .from("links")
    .select("id, raw_url, source_domain")
    .eq("status", "pending")
    .lt("created_at", staleBefore)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    console.error("[cron/process-links] pending 레코드 조회 실패", error);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }

  await processLinks(pendingLinks ?? []);

  return NextResponse.json({ processed: pendingLinks?.length ?? 0 });
}
