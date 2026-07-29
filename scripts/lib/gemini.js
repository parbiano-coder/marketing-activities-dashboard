import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

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
  type: SchemaType.OBJECT,
  properties: {
    activityType: { type: SchemaType.STRING, format: "enum", enum: ACTIVITY_TYPES },
    eventDate: { type: SchemaType.STRING, nullable: true, description: "행사/활동 일자 (알 수 없으면 null)" },
    location: { type: SchemaType.STRING, nullable: true, description: "장소 (알 수 없으면 null)" },
    format: { type: SchemaType.STRING, nullable: true, description: "진행 방식, 예: 오프라인 컨퍼런스, 온라인 웨비나, 보도자료 배포" },
    slogan: { type: SchemaType.STRING, nullable: true, description: "핵심 슬로건/캐치프레이즈 (본문에 명시된 경우만)" },
    keyMessage: { type: SchemaType.STRING, description: "이 활동의 핵심 메시지를 1~2문장으로 요약" },
    llmAnomalyNote: {
      type: SchemaType.STRING,
      nullable: true,
      description: "이 회사의 최근 활동들과 비교했을 때 특이한 점이 있으면 한 문장으로, 없으면 null",
    },
  },
  required: ["activityType", "keyMessage"],
};

// 무료 티어는 분당 요청 수(RPM)가 낮다 (모델에 따라 5~15 정도).
// SDK 자체 재시도는 짧게 끝나버려 429가 그대로 던져지므로, 호출 사이 최소 간격을 두고
// 그래도 429가 나면 응답에 담긴 retryDelay만큼 기다렸다가 한 번 더 시도한다.
const MIN_INTERVAL_MS = Number(process.env.GEMINI_MIN_INTERVAL_MS || 8000);
let lastCallAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRateLimit() {
  const elapsed = Date.now() - lastCallAt;
  if (elapsed < MIN_INTERVAL_MS) await sleep(MIN_INTERVAL_MS - elapsed);
  lastCallAt = Date.now();
}

function parseRetryDelayMs(err) {
  const match = String(err?.message || "").match(/"retryDelay":"(\d+(?:\.\d+)?)s"/);
  return match ? Math.ceil(Number(match[1]) * 1000) + 1000 : null;
}

let cachedClient = null;

function getModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.");
  if (!cachedClient) cachedClient = new GoogleGenerativeAI(apiKey);

  const modelName = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  return cachedClient.getGenerativeModel({
    model: modelName,
    generationConfig: { responseMimeType: "application/json", responseSchema },
  });
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
  const model = getModel();
  const prompt = buildPrompt({ company, category, title, publisher, textContent, recentTitles });

  await waitForRateLimit();
  let result;
  try {
    result = await model.generateContent(prompt, { timeout: 30000 });
  } catch (err) {
    const retryDelayMs = parseRetryDelayMs(err);
    if (!retryDelayMs) throw err;
    console.log(`  [Gemini 429] ${Math.round(retryDelayMs / 1000)}초 대기 후 재시도...`);
    await sleep(retryDelayMs);
    lastCallAt = Date.now();
    result = await model.generateContent(prompt, { timeout: 30000 }); // 한 번만 재시도, 또 실패하면 그대로 던져서 fallback 처리
  }
  const raw = result.response.text();

  try {
    const parsed = JSON.parse(raw);
    return {
      activityType: ACTIVITY_TYPES.includes(parsed.activityType) ? parsed.activityType : "기타",
      eventDate: parsed.eventDate ?? null,
      location: parsed.location ?? null,
      format: parsed.format ?? null,
      slogan: parsed.slogan ?? null,
      keyMessage: parsed.keyMessage || title,
      llmAnomalyNote: parsed.llmAnomalyNote ?? null,
    };
  } catch {
    return fallbackActivity(title);
  }
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
