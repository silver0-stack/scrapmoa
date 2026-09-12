import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createAdminClient } from "@/lib/supabase/admin";
import { processLinks } from "@/lib/linkProcessor";

export const runtime = "nodejs"; // 크롤링(jsdom)이 Node API를 필요로 함
export const maxDuration = 60; // waitUntil 백그라운드 작업(크롤링+Gemini)이 끝날 시간을 확보

// 문장 중간에 섞여 있어도 잡아내야 하므로 startsWith('http') 대신 정규식으로 추출한다.
const URL_REGEX = /https?:\/\/[^\s]+/g;
// 대시보드에서 발급한 6자리 연동 코드와 정확히 일치할 때만 연동 흐름으로 분기한다.
const LINK_CODE_REGEX = /^\d{6}$/;

function simpleTextResponse(text) {
  return NextResponse.json({
    version: "2.0",
    template: {
      outputs: [{ simpleText: { text } }],
    },
  });
}

function buildResponse(outputs) {
  return NextResponse.json({ version: "2.0", template: { outputs } });
}

// 저장/연동 성공처럼 대시보드로 이어지는 응답은 카드로 보여준다. 방금 저장한
// 링크의 실제 썸네일은 이 시점엔 크롤링 전이라 알 수 없고(5초 안에 응답해야
// 하는데 크롤링은 느릴 수 있어 동기로 하면 위험), 대신 고정된 서비스 로고를 쓴다.
function brandedCardOutput({ title, description, dashboardUrl, origin }) {
  return {
    basicCard: {
      title,
      description,
      thumbnail: { imageUrl: `${origin}/logo-card.png` },
      buttons: [
        { action: "webLink", label: "대시보드에서 보기", webLinkUrl: dashboardUrl },
      ],
    },
  };
}

// 안 읽은 링크 중 썸네일이 있는(=이미 처리 완료된) 것만 사진과 함께 캐러셀로 보여준다.
// 링크를 누르면 대시보드가 아니라 원문으로 바로 이동해서 실제로 "읽으러" 가게 만든다.
function unreadCarouselOutput(preview) {
  const items = preview
    .filter((link) => link.thumbnail_url)
    .map((link) => ({
      title: link.title || link.source_domain || link.raw_url,
      description: link.summary ? link.summary.split("\n")[0] : undefined,
      thumbnail: { imageUrl: link.thumbnail_url },
      buttons: [
        {
          action: "webLink",
          label: "읽으러 가기",
          webLinkUrl: link.resolved_url || link.raw_url,
        },
      ],
    }));

  if (items.length === 0) return null;

  return { carousel: { type: "basicCard", items } };
}

function extractSourceDomain(rawUrl) {
  try {
    return new URL(rawUrl).hostname;
  } catch (error) {
    console.error("[kakao-webhook] URL 파싱 실패", rawUrl, error);
    return null;
  }
}

// "모으기만 하고 안 읽는다"는 문제를 조금이라도 줄여보려고, 링크를 저장할 때마다
// (즉 사용자가 어차피 챗봇을 열어본 시점에) 밀린 안 읽은 개수를 슬쩍 알려준다.
async function countUnreadLinks(supabase, botIdentityId) {
  const { count, error } = await supabase
    .from("links")
    .select("id", { count: "exact", head: true })
    .eq("bot_identity_id", botIdentityId)
    .eq("is_read", false)
    .eq("is_archived", false);

  if (error) {
    console.error("[kakao-webhook] 안 읽은 링크 개수 조회 실패", error);
    return null;
  }

  return count;
}

// 오래된(created_at 기준 가장 먼저 쌓인) 순서로 미리보기용 제목 몇 개를 가져온다.
// 방금 막 저장한 링크는 created_at이 가장 최근이라 자연히 여기 안 걸린다.
async function getUnreadPreview(supabase, botIdentityId, limit) {
  const { data, error } = await supabase
    .from("links")
    .select("title, raw_url, resolved_url, source_domain, summary, thumbnail_url")
    .eq("bot_identity_id", botIdentityId)
    .eq("is_read", false)
    .eq("is_archived", false)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[kakao-webhook] 안 읽은 링크 미리보기 조회 실패", error);
    return [];
  }

  return data ?? [];
}

async function findOrCreateBotIdentity(supabase, botUserKey) {
  const { data: existing, error: selectError } = await supabase
    .from("bot_identities")
    .select("id, user_id")
    .eq("kakao_bot_user_key", botUserKey)
    .maybeSingle();

  if (selectError) {
    console.error("[kakao-webhook] bot_identities 조회 실패", selectError);
    throw selectError;
  }

  if (existing) return existing;

  const { data: created, error: insertError } = await supabase
    .from("bot_identities")
    .insert({ kakao_bot_user_key: botUserKey })
    .select("id, user_id")
    .single();

  if (insertError) {
    console.error("[kakao-webhook] bot_identities 생성 실패", insertError);
    throw insertError;
  }

  return created;
}

async function redeemLinkCode(supabase, botUserKey, code) {
  const nowIso = new Date().toISOString();

  const { data: linkCode, error: selectError } = await supabase
    .from("link_codes")
    .select("code, user_id")
    .eq("code", code)
    .eq("used", false)
    .gt("expires_at", nowIso)
    .maybeSingle();

  if (selectError) {
    console.error("[kakao-webhook] link_codes 조회 실패", selectError);
    throw selectError;
  }

  if (!linkCode) {
    return { success: false };
  }

  const botIdentity = await findOrCreateBotIdentity(supabase, botUserKey);

  const { error: updateBotIdentityError } = await supabase
    .from("bot_identities")
    .update({ user_id: linkCode.user_id, linked_at: nowIso })
    .eq("id", botIdentity.id);

  if (updateBotIdentityError) {
    console.error(
      "[kakao-webhook] bot_identities 연동 업데이트 실패",
      updateBotIdentityError
    );
    throw updateBotIdentityError;
  }

  // 로그인 전에 이 봇 사용자가 저장해둔 링크(user_id가 null인 것)를 소급으로 연결한다.
  const { error: backfillError } = await supabase
    .from("links")
    .update({ user_id: linkCode.user_id })
    .eq("bot_identity_id", botIdentity.id)
    .is("user_id", null);

  if (backfillError) {
    console.error("[kakao-webhook] links 소급 연결 실패", backfillError);
    throw backfillError;
  }

  const { error: markUsedError } = await supabase
    .from("link_codes")
    .update({ used: true, bot_user_key: botUserKey })
    .eq("code", code);

  if (markUsedError) {
    // 연동 자체(bot_identities/links 갱신)는 끝났으니 치명적이진 않다. 로그만 남긴다.
    console.error("[kakao-webhook] link_codes used 표시 실패", markUsedError);
  }

  return { success: true };
}

// 이 URL은 공개되어 있어 아무나 호출할 수 있으므로, 오픈빌더 스킬의 "헤더값" 설정에
// 이 값을 넣어 요청 출처를 검증한다 (없으면 누구나 가짜 요청으로 DB를 오염시킬 수 있음).
const SKILL_SECRET_HEADER = "x-scrapmoa-skill-secret";

export async function POST(request) {
  try {
    if (request.headers.get(SKILL_SECRET_HEADER) !== process.env.KAKAO_SKILL_SECRET) {
      console.error("[kakao-webhook] 스킬 시크릿 검증 실패");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body;
    try {
      body = await request.json();
    } catch (error) {
      console.error("[kakao-webhook] 요청 body 파싱 실패", error);
      return simpleTextResponse("요청을 처리하지 못했어요. 다시 시도해주세요.");
    }

    const botUserKey = body?.userRequest?.user?.id;
    const utterance = body?.userRequest?.utterance ?? "";

    if (!botUserKey) {
      console.error("[kakao-webhook] userRequest.user.id 없음", body?.userRequest);
      return simpleTextResponse("요청을 처리하지 못했어요. 다시 시도해주세요.");
    }

    const supabase = createAdminClient();
    const trimmedUtterance = utterance.trim();
    const origin = new URL(request.url).origin;
    const dashboardUrl = `${origin}/dashboard`;

    // 대시보드 연동 코드(6자리 숫자) 입력 흐름: URL 저장 흐름보다 먼저 체크한다.
    if (LINK_CODE_REGEX.test(trimmedUtterance)) {
      try {
        const result = await redeemLinkCode(supabase, botUserKey, trimmedUtterance);
        if (result.success) {
          return buildResponse([
            brandedCardOutput({
              title: "연동됐어요!",
              description: "로그인 전에 저장한 링크도 대시보드에서 확인할 수 있어요.",
              dashboardUrl,
              origin,
            }),
          ]);
        }
        return simpleTextResponse(
          "코드가 올바르지 않거나 만료됐어요. 대시보드에서 새 코드를 발급받아주세요."
        );
      } catch (error) {
        console.error("[kakao-webhook] 연동 코드 처리 중 오류", error);
        return simpleTextResponse("연동 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.");
      }
    }

    const urls = [...new Set(utterance.match(URL_REGEX) ?? [])];

    if (urls.length === 0) {
      return simpleTextResponse(
        "저장할 링크를 찾지 못했어요. http:// 또는 https:// 로 시작하는 주소를 포함해서 다시 보내주세요."
      );
    }

    // links insert(status: pending)는 크롤링/AI 호출보다 먼저, 별도로 수행한다.
    // 이 단계에서 실패하지 않는 한 원본 URL은 반드시 DB에 남는다.
    const botIdentity = await findOrCreateBotIdentity(supabase, botUserKey);

    const rowsToInsert = urls.map((rawUrl) => ({
      raw_url: rawUrl,
      source_domain: extractSourceDomain(rawUrl),
      user_id: botIdentity.user_id,
      bot_identity_id: botIdentity.id,
      status: "pending",
    }));

    const { data: insertedLinks, error: insertLinksError } = await supabase
      .from("links")
      .insert(rowsToInsert)
      .select("id, raw_url, source_domain");

    if (insertLinksError) {
      console.error("[kakao-webhook] links insert 실패", insertLinksError);
      return simpleTextResponse("저장 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.");
    }

    // fire-and-forget 금지: await 없이 던지면 서버리스 함수가 응답 직후 종료되어
    // 백그라운드 작업이 중간에 끊길 수 있다. 반드시 waitUntil로 감싼다.
    waitUntil(processLinks(insertedLinks));

    const saveTitle = urls.length === 1 ? "저장했어요!" : `링크 ${urls.length}개를 저장했어요!`;
    let saveDescription = "잠시 후 요약이 완성돼요.";
    let carousel = null;

    // 방금 저장한 것 말고도 밀린 게 있을 때만 리마인드한다 (안 그러면 매번 "1개 있어요"처럼 뻔한 소리가 됨).
    const unreadCount = await countUnreadLinks(supabase, botIdentity.id);
    if (unreadCount && unreadCount > urls.length) {
      const PREVIEW_LIMIT = 5;
      const preview = await getUnreadPreview(supabase, botIdentity.id, PREVIEW_LIMIT);
      carousel = unreadCarouselOutput(preview);

      if (carousel) {
        // 캐러셀은 썸네일 있는 것만 골라서 보여주기 때문에 전체 안읽음 개수랑
        // 다를 수 있다. "5개인데 카드가 4개"처럼 안 맞아 보이지 않게, 실제로
        // 보여주는 개수를 정확히 말한다.
        const shownCount = carousel.carousel.items.length;
        saveDescription +=
          shownCount < unreadCount
            ? `\n\n안 읽은 링크가 ${unreadCount}개 있어요. 그중 최근 ${shownCount}개를 보여드려요.`
            : `\n\n안 읽은 링크가 ${unreadCount}개 있어요. 아래에서 바로 확인해보세요.`;
      } else {
        // 아직 썸네일이 없는(처리 전) 것들뿐이면 캐러셀 대신 텍스트 목록으로 대체한다.
        const previewLines = preview
          .map((link) => `· ${link.title || link.source_domain || link.raw_url}`)
          .join("\n");
        const remaining = unreadCount - preview.length;
        saveDescription += `\n\n안 읽은 링크가 ${unreadCount}개 있어요.`;
        if (previewLines) saveDescription += `\n${previewLines}`;
        if (remaining > 0) saveDescription += `\n...외 ${remaining}개`;
      }
    }

    const outputs = [
      brandedCardOutput({ title: saveTitle, description: saveDescription, dashboardUrl, origin }),
    ];
    if (carousel) outputs.push(carousel);

    return buildResponse(outputs);
  } catch (error) {
    // 예상 못한 오류도 카카오 오픈빌더 규격(200 + simpleText)으로 응답해야
    // 스킬 서버가 실패로 처리하지 않고, 유저에게는 스택트레이스가 노출되지 않는다.
    console.error("[kakao-webhook] 처리 중 알 수 없는 오류", error);
    return simpleTextResponse("저장 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.");
  }
}
