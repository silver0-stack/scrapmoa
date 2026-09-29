import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processLinks } from "@/lib/linkProcessor";

export const runtime = "nodejs";
export const maxDuration = 60;

// 웹훅의 waitUntil 처리가 아직 끝나지 않았을 수 있으니, 생성된 지 얼마 안 된
// pending 레코드는 건드리지 않고 일정 시간 이상 방치된 것만 재처리 대상으로 삼는다.
// quota_exceeded(분당 한도 초과로 확정된 것)도 하루 지나면 한도가 풀렸을 테니 같이 재시도한다.
const STALE_MINUTES = 3;
// 1회 실행에서 조회할 후보 개수. gemini-3.5-flash-lite 기준 링크 사이 딜레이는 4초로
// 넉넉하지만, 429를 만나면 재시도로 최대 22초(2s+5s+15s)가 붙을 수 있다. processLinks의
// 데드라인 가드가 시간이 부족하면 남은 링크를 건너뛰어주므로(다음 실행 때 처리됨)
// 타임아웃으로 죽는 일은 없다.
const BATCH_LIMIT = 3;

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
    .in("status", ["pending", "quota_exceeded"])
    .lt("created_at", staleBefore)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    console.error("[cron/process-links] 재처리 대상 조회 실패", error);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }

  // maxDuration(60s) 안에서 안전 마진을 두고, 앞 링크들이 Gemini 재시도로 시간을
  // 다 써버리면 나머지는 건너뛰도록 데드라인을 넘긴다 (lib/linkProcessor.js 참고).
  await processLinks(pendingLinks ?? [], { deadline: Date.now() + 50000 });

  return NextResponse.json({ processed: pendingLinks?.length ?? 0 });
}
