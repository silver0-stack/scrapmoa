// gemini-3.8-flash(프리뷰)는 AI Studio 대시보드로 실측해보니 RPD(하루 한도)가
// 단 20건이라 서비스 운영이 불가능한 수준이었음 (2026-09-29 확인). 정식(stable) 모델인
// gemini-3.5-flash-lite로 교체함 (같은 방식으로 실측한 무료 한도: RPM 20 / RPD 500).
// v1beta/interactions는 모델과 무관한 통합 엔드포인트라 모델 이름만 바꾸면 됨
// (ai.google.dev/gemini-api/docs 공식 문서 확인). 정확한 RPM/RPD는 계정별로 AI Studio
// 대시보드에서 다를 수 있어 보수적으로 호출 간격을 둔다 (lib/linkProcessor.js).

const GEMINI_MODEL = "gemini-3.5-flash-lite";
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
      description: "핵심 내용을 담은 한국어 한 줄 요약. 한 문장으로 간결하게.",
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

// gemini-3.5-flash-lite는 정식 모델이라 "high demand" 5xx는 훨씬 덜 발생할 것으로
// 예상되지만, 그래도 429(분당 한도 초과)는 여전히 가능하다. 재시도 자체도 요청 1건으로
// 카운트되니 재시도를 남발하면 오히려 한도를 더 빨리 소진시킨다는 점을 주의.
// 그래서 5xx보다 429에는 조금 더 긴 재시도 간격을 준다 (단, 이 웹훅 함수의
// maxDuration=60s 안에는 들어와야 한다).
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
        "너는 북마크 서비스의 링크 요약 도우미다. 주어진 웹페이지 정보를 바탕으로 한국어로 제목/한줄요약/카테고리/태그를 JSON으로만 출력한다. 정보가 부족해도 최선을 다해 추정해서 채운다.",
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
