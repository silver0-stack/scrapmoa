// Google Gemini Flash (AI Studio) 무료 티어: RPM 15 / RPD 1500 (CLAUDE.md 기준).
// 정확한 한도는 계정별로 AI Studio 대시보드에서 다를 수 있어 보수적으로 호출 간격을 둔다 (lib/linkProcessor.js).
// API 스펙(엔드포인트/필드명)은 2026-09 시점 공식 문서(ai.google.dev/gemini-api/docs)를 기준으로 확인함.

const GEMINI_MODEL = "gemini-3.8-flash";
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

export class GeminiQuotaExceededError extends Error {}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description: "간결한 한국어 제목. 원문 제목이 있으면 다듬어서 사용.",
    },
    summary: {
      type: "string",
      description: "핵심 내용을 담은 한국어 3줄 요약. 각 줄은 개행문자(\\n)로 구분.",
    },
    category: {
      type: "string",
      description: "링크를 분류할 한국어 카테고리 한 단어~짧은 구 (예: 개발, 요리, 재테크, 뉴스, 여행).",
    },
    tags: {
      type: "array",
      items: { type: "string" },
      description: "핵심 키워드 한국어 태그 3~5개.",
    },
  },
  required: ["title", "summary", "category", "tags"],
};

function buildInputText({ url, title, description, bodyText }) {
  return [
    `URL: ${url}`,
    title ? `원문 제목: ${title}` : null,
    description ? `설명(OG description): ${description}` : null,
    bodyText ? `본문 발췌:\n${bodyText}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function extractOutputText(responseBody) {
  const modelOutputStep = responseBody?.steps?.find(
    (step) => step.type === "model_output"
  );
  const textPart = modelOutputStep?.content?.find((part) => part.type === "text");
  return textPart?.text ?? null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// gemini-3.8-flash가 프리뷰 단계라 "high demand" 5xx가 종종 발생하고,
// 429는 분당 요청 한도(무료 티어 기준 분당 20회)에 걸린 경우가 실제로 확인됨
// (에러 메시지에 "retry in ~55s" 식으로 명시됨). 그래서 5xx보다 429에는
// 조금 더 긴 재시도 간격을 준다 (단, 이 웹훅 함수의 maxDuration=60s 안에는 들어와야 함).
const TRANSIENT_RETRY_DELAYS_MS = [2000, 5000, 15000];

async function callGeminiOnce(apiKey, inputText) {
  const response = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      model: GEMINI_MODEL,
      system_instruction:
        "너는 북마크 서비스의 링크 요약 도우미다. 주어진 웹페이지 정보를 바탕으로 한국어로 제목/3줄요약/카테고리/태그를 JSON으로만 출력한다. 정보가 부족해도 최선을 다해 추정해서 채운다.",
      input: inputText,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: RESPONSE_SCHEMA,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    const error = new Error(
      `Gemini 호출 실패 (status: ${response.status}) ${errText}`.trim()
    );
    error.status = response.status;
    throw error;
  }

  return response.json();
}

async function callGeminiWithRetry(apiKey, inputText) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await callGeminiOnce(apiKey, inputText);
    } catch (error) {
      // 429도 실제 하루 한도 초과가 아니라 프리뷰 모델의 일시적 과부하로 오는 경우가
      // 많아서(직접 확인함), 5xx와 마찬가지로 몇 번 재시도해본 뒤에만 포기한다.
      const isTransient = error.status >= 500 || error.status === 429;
      if (!isTransient || attempt >= TRANSIENT_RETRY_DELAYS_MS.length) {
        if (error.status === 429) {
          throw new GeminiQuotaExceededError(error.message);
        }
        throw error;
      }
      console.error(
        `[gemini] 일시적 오류로 재시도 (attempt ${attempt + 1})`,
        error.message
      );
      await sleep(TRANSIENT_RETRY_DELAYS_MS[attempt]);
    }
  }
}

export async function summarizeWithGemini({ url, title, description, bodyText }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");
  }

  const inputText = buildInputText({ url, title, description, bodyText });
  const responseBody = await callGeminiWithRetry(apiKey, inputText);
  const outputText = extractOutputText(responseBody);

  if (!outputText) {
    throw new Error("Gemini 응답에서 결과 텍스트를 찾을 수 없음");
  }

  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch (error) {
    throw new Error(`Gemini 응답 JSON 파싱 실패: ${error.message}`);
  }

  if (!parsed.title || !parsed.summary) {
    throw new Error("Gemini 응답에 title/summary 필드가 없음");
  }

  return {
    title: parsed.title,
    summary: parsed.summary,
    category: parsed.category || "기타",
    tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : [],
  };
}
