import { query } from "@anthropic-ai/claude-agent-sdk";

export const ACTIVITY_TYPES = [
  "행사·컨퍼런스",
  "전시",
  "웨비나",
  "신제품·서비스 출시",
  "언론보도",
  "고객사례",
  "파트너십·제휴",
  "기타",
];

const responseSchema = {
  type: "object",
  properties: {
    activityType: { type: "string", enum: ACTIVITY_TYPES },
    eventDate: { type: ["string", "null"], description: "행사/활동 일자 (알 수 없으면 null)" },
    location: { type: ["string", "null"], description: "장소 (알 수 없으면 null)" },
    format: { type: ["string", "null"], description: "진행 방식, 예: 오프라인 컨퍼런스, 온라인 웨비나, 보도자료 배포" },
    slogan: { type: ["string", "null"], description: "핵심 슬로건/캐치프레이즈 (본문에 명시된 경우만)" },
    keyMessage: { type: "string", description: "이 활동의 핵심 메시지를 1~2문장으로 요약" },
    llmAnomalyNote: {
      type: ["string", "null"],
      description: "이 회사의 최근 활동들과 비교했을 때 특이한 점이 있으면 한 문장으로, 없으면 null",
    },
  },
  required: ["activityType", "keyMessage"],
};

// 무료 API가 아니라 사용자 개인 Claude 구독 사용량을 쓰므로, 과도한 호출로 개인 한도를
// 소진하지 않도록 호출 사이 최소 간격을 둔다 (Gemini 때의 429 페이싱과 같은 취지).
const MIN_INTERVAL_MS = Number(process.env.CLAUDE_MIN_INTERVAL_MS || 3000);
let lastCallAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitBetweenCalls() {
  const elapsed = Date.now() - lastCallAt;
  if (elapsed < MIN_INTERVAL_MS) await sleep(MIN_INTERVAL_MS - elapsed);
  lastCallAt = Date.now();
}

function buildPrompt({ company, category, title, publisher, textContent, recentTitles }) {
  const context =
    recentTitles.length > 0
      ? `이 회사의 최근 활동 제목들(참고용, 지금 분석할 항목과 비교해 특이점이 있는지 판단할 때만 사용):\n${recentTitles
          .map((t) => `- ${t}`)
          .join("\n")}`
      : "이 회사의 이전 활동 기록은 아직 없습니다.";

  return `너는 국내 IT서비스/디지털금융 기업의 마케팅 활동을 모니터링하는 애널리스트다.
아래는 "${company}"(${category})의 마케팅 관련 활동(행사/전시/웨비나/신제품 출시/언론보도/고객사례/파트너십 등) 기사다.

제목: ${title}
출처: ${publisher}
본문:
"""
${textContent || "(본문을 가져오지 못했습니다. 제목만으로 판단하세요.)"}
"""

${context}

위 내용을 바탕으로 활동 유형, 일시, 장소, 진행 방식, 슬로건, 핵심 메시지를 뽑아라.
본문에 명시되지 않은 정보는 추측하지 말고 반드시 null로 남겨라 (특히 슬로건과 장소는 본문에 실제로 등장한 경우에만 채워라).
특이점(llmAnomalyNote)은 위 "최근 활동 제목"과 비교했을 때 눈에 띄게 다른 점(예: 처음 시도하는 형식, 이례적인 파트너, 급격한 전략 전환)이 있을 때만 한 문장으로 쓰고, 없으면 null로 남겨라.`;
}

export async function extractActivity({ company, category, title, publisher, textContent, recentTitles }) {
  const prompt = buildPrompt({ company, category, title, publisher, textContent, recentTitles });

  await waitBetweenCalls();

  let structured = null;
  for await (const message of query({
    prompt,
    options: {
      // 하이쿠 모델 + 툴 사용 금지: 순수 텍스트 분석이라 굳이 소네트/툴콜 없이 가볍게 처리
      model: process.env.CLAUDE_MODEL || "claude-haiku-4-5",
      maxTurns: 3,
      allowedTools: [],
      outputFormat: { type: "json_schema", schema: responseSchema },
    },
  })) {
    if (message.type === "result") {
      if (message.subtype === "success" && message.structured_output) {
        structured = message.structured_output;
      } else {
        console.log(`  [Claude 디버그] subtype=${message.subtype} errors=${JSON.stringify(message.errors)}`);
      }
      break;
    }
  }

  if (!structured) return fallbackActivity(title);

  return {
    activityType: ACTIVITY_TYPES.includes(structured.activityType) ? structured.activityType : "기타",
    eventDate: structured.eventDate ?? null,
    location: structured.location ?? null,
    format: structured.format ?? null,
    slogan: structured.slogan ?? null,
    keyMessage: structured.keyMessage || title,
    llmAnomalyNote: structured.llmAnomalyNote ?? null,
  };
}

export function fallbackActivity(title) {
  return {
    activityType: "기타",
    eventDate: null,
    location: null,
    format: null,
    slogan: null,
    keyMessage: title,
    llmAnomalyNote: null,
  };
}
