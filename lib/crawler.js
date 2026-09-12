import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

// jsdom, @mozilla/readability: MIT 라이선스 오픈소스 라이브러리.
// 별도 API 호출이 아니라 로컬 파싱이므로 요금/무료 티어 한도가 없다.
// 헤드리스 브라우저(Puppeteer)는 사용하지 않는다 (CLAUDE.md 원칙).

const FETCH_TIMEOUT_MS = 8000;
const MIN_BODY_TEXT_LENGTH = 80;
const MAX_BODY_TEXT_LENGTH = 4000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; KakaoScrapBot/1.0; +https://kakao-scrap.example/bot)";

export class RestrictedContentError extends Error {}

function getMetaContent(document, property) {
  const el =
    document.querySelector(`meta[property="${property}"]`) ||
    document.querySelector(`meta[name="${property}"]`);
  const content = el?.getAttribute("content");
  return content ? content.trim() : null;
}

function extractArticleText(document) {
  try {
    const reader = new Readability(document);
    const parsed = reader.parse();
    return parsed?.textContent?.trim() || null;
  } catch (error) {
    console.error("[crawler] Readability 파싱 실패", error);
    return null;
  }
}

export async function crawlUrl(rawUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(rawUrl, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if ([401, 403, 429, 451].includes(response.status)) {
    throw new RestrictedContentError(
      `비공개/접근 제한 페이지로 추정 (status: ${response.status})`
    );
  }

  if (!response.ok) {
    throw new Error(`크롤링 실패 (status: ${response.status})`);
  }

  const html = await response.text();
  const dom = new JSDOM(html, { url: response.url });
  const { document } = dom.window;

  const ogTitle = getMetaContent(document, "og:title");
  const ogDescription = getMetaContent(document, "og:description");
  const ogImage = getMetaContent(document, "og:image");
  const fallbackTitle = document.querySelector("title")?.textContent?.trim() || null;

  // Readability로 본문 추출 시도, 실패하거나 내용이 너무 짧으면 OG description으로 폴백한다.
  const articleText = extractArticleText(document);
  const bodyText =
    articleText && articleText.length >= MIN_BODY_TEXT_LENGTH
      ? articleText
      : ogDescription || "";

  const title = ogTitle || fallbackTitle;

  if (!title && !ogDescription && !bodyText) {
    // 로그인 월/봇 차단 등으로 메타데이터조차 없는 경우 (예: 인스타그램 비공개 게시물)
    throw new RestrictedContentError("본문/메타데이터를 찾을 수 없음");
  }

  return {
    resolvedUrl: response.url,
    title,
    description: ogDescription,
    bodyText: bodyText.slice(0, MAX_BODY_TEXT_LENGTH),
    thumbnailUrl: ogImage,
  };
}
