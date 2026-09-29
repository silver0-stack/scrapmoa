import { createAdminClient } from "./supabase/admin";
import { crawlUrl, RestrictedContentError } from "./crawler";
import { summarizeWithGemini, GeminiQuotaExceededError } from "./gemini";

// gemini-3.5-flash-lite 무료 티어 RPM 20 (2026-09-29 AI Studio 대시보드로 실측).
// 이론상 3초 간격이면 충분하지만 안전 마진을 두고 4초로 잡는다. 재시도 호출도
// 전부 요청 1건으로 카운트되니 여러 링크를 한 번에 몰아 처리하지 않는 게 중요하다
// (백로그 피기백을 뺀 이유).
const GEMINI_CALL_DELAY_MS = 4000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function logFailure(supabase, linkId, errorType, errorDetail) {
  const { error } = await supabase.from("processing_failures").insert({
    link_id: linkId,
    error_type: errorType,
    error_detail: String(errorDetail ?? "").slice(0, 2000),
  });
  if (error) {
    console.error("[linkProcessor] processing_failures insert 실패", linkId, error);
  }
}

async function updateLink(supabase, linkId, fields) {
  const { error } = await supabase
    .from("links")
    .update({ ...fields, processed_at: new Date().toISOString() })
    .eq("id", linkId);
  if (error) {
    console.error("[linkProcessor] links update 실패", linkId, error);
  }
}

async function processOneLink(supabase, link) {
  let crawled;
  try {
    crawled = await crawlUrl(link.raw_url);
  } catch (error) {
    if (error instanceof RestrictedContentError) {
      await updateLink(supabase, link.id, { status: "restricted" });
      await logFailure(supabase, link.id, "restricted", error.message);
      return;
    }
    console.error("[linkProcessor] 크롤링 실패", link.id, link.raw_url, error);
    await updateLink(supabase, link.id, { status: "failed" });
    await logFailure(supabase, link.id, "crawl_error", error.message ?? error);
    return;
  }

  try {
    const summary = await summarizeWithGemini({
      url: crawled.resolvedUrl,
      title: crawled.title,
      description: crawled.description,
      bodyText: crawled.bodyText,
    });

    await updateLink(supabase, link.id, {
      resolved_url: crawled.resolvedUrl,
      title: summary.title,
      summary: summary.summary,
      category: summary.category,
      tags: summary.tags,
      thumbnail_url: crawled.thumbnailUrl,
      status: "processed",
    });
  } catch (error) {
    if (error instanceof GeminiQuotaExceededError) {
      // 크롤링은 성공했으니 원본 URL/메타데이터는 남기고 상태만 quota_exceeded로 표시한다.
      await updateLink(supabase, link.id, {
        resolved_url: crawled.resolvedUrl,
        thumbnail_url: crawled.thumbnailUrl,
        status: "quota_exceeded",
      });
      await logFailure(supabase, link.id, "gemini_quota_exceeded", error.message);
      return;
    }

    console.error("[linkProcessor] Gemini 요약 실패", link.id, link.raw_url, error);
    await updateLink(supabase, link.id, {
      resolved_url: crawled.resolvedUrl,
      thumbnail_url: crawled.thumbnailUrl,
      status: "failed",
    });
    await logFailure(supabase, link.id, "gemini_error", error.message ?? error);
  }
}

// 링크 1건 처리(크롤링+Gemini 재시도 포함)가 최악의 경우 얼마나 걸릴지 넉넉히 잡은 값.
// 남은 시간 예산이 이보다 적으면 다음 링크는 아예 시작하지 않는다 (Vercel maxDuration=60s
// 타임아웃으로 함수가 강제 종료되면, 진행 중이던 링크가 DB 업데이트도 못 하고 pending에
// 영원히 갇혀버리기 때문에, 타임아웃 자체를 맞지 않는 게 훨씬 안전하다).
const MIN_TIME_BUDGET_MS = 25000;

export async function processLinks(links, { deadline } = {}) {
  if (!links || links.length === 0) return;

  const supabase = createAdminClient();

  for (let i = 0; i < links.length; i++) {
    if (deadline && Date.now() > deadline - MIN_TIME_BUDGET_MS) {
      console.error(
        `[linkProcessor] 남은 시간 예산 부족으로 ${links.length - i}건 건너뜀 (다음 재시도 때 처리됨)`
      );
      break;
    }
    if (i > 0) await sleep(GEMINI_CALL_DELAY_MS);
    await processOneLink(supabase, links[i]);
  }
}
