import { createAdminClient } from "./supabase/admin";
import { crawlUrl, RestrictedContentError } from "./crawler";
import { summarizeWithGemini, GeminiQuotaExceededError } from "./gemini";

// Gemini 무료 티어 RPM 15 제한 대응: 링크를 순차 처리하며 호출 사이에 딜레이를 둔다.
const GEMINI_CALL_DELAY_MS = 4500;

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

export async function processLinks(links) {
  if (!links || links.length === 0) return;

  const supabase = createAdminClient();

  for (let i = 0; i < links.length; i++) {
    if (i > 0) await sleep(GEMINI_CALL_DELAY_MS);
    await processOneLink(supabase, links[i]);
  }
}
