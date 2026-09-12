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

function extractSourceDomain(rawUrl) {
  try {
    return new URL(rawUrl).hostname;
  } catch (error) {
    console.error("[kakao-webhook] URL 파싱 실패", rawUrl, error);
    return null;
  }
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

export async function POST(request) {
  try {
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

    // 대시보드 연동 코드(6자리 숫자) 입력 흐름: URL 저장 흐름보다 먼저 체크한다.
    if (LINK_CODE_REGEX.test(trimmedUtterance)) {
      try {
        const result = await redeemLinkCode(supabase, botUserKey, trimmedUtterance);
        if (result.success) {
          return simpleTextResponse(
            "연동됐어요! 로그인 전에 저장한 링크도 대시보드에서 확인할 수 있어요."
          );
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
        "저장할 링크를 찾지 못했어요. http:// 로 시작하는 주소를 포함해서 다시 보내주세요."
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

    const message =
      urls.length === 1
        ? "저장했어요!"
        : `링크 ${urls.length}개를 저장했어요!`;

    return simpleTextResponse(message);
  } catch (error) {
    // 예상 못한 오류도 카카오 오픈빌더 규격(200 + simpleText)으로 응답해야
    // 스킬 서버가 실패로 처리하지 않고, 유저에게는 스택트레이스가 노출되지 않는다.
    console.error("[kakao-webhook] 처리 중 알 수 없는 오류", error);
    return simpleTextResponse("저장 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.");
  }
}
