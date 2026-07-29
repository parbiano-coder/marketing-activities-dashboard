import "dotenv/config"; // 로컬 실행 시 .env의 GEMINI_API_KEY를 읽어온다 (GitHub Actions에서는 secret이 이미 env로 주입되므로 .env가 없어도 무해함)
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

import { CATEGORY_IT, CATEGORY_FINANCE, COMPANIES } from "./sources.js";
import { fetchGoogleNews } from "./lib/googleNews.js";
import { fetchNewsroom } from "./lib/newsroom.js";
import { extractArticle } from "./lib/extractContent.js";
import { extractActivity, fallbackActivity, ACTIVITY_TYPES } from "./lib/gemini.js";
import { annotateStatisticalSpikes } from "./lib/anomaly.js";

const OUTPUT_PATH = path.join(process.cwd(), "data", "activities.json");
const NEWS_PER_COMPANY = 10;
const MAX_LLM_CALLS_PER_RUN = Number(process.env.MAX_LLM_CALLS_PER_RUN || 15); // 이 계정 무료 티어가 모델 무관 일일 20건 한도라 여유를 둠
const COMPANY_LIMIT = process.env.COMPANY_LIMIT ? Number(process.env.COMPANY_LIMIT) : COMPANIES.length;
const USE_GEMINI = Boolean(process.env.GEMINI_API_KEY);

function idFor(link) {
  return crypto.createHash("sha1").update(link).digest("hex").slice(0, 16);
}

async function loadExisting() {
  try {
    const raw = await readFile(OUTPUT_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { updatedAt: null, activities: [] };
  }
}

async function gatherRawItems(company) {
  const results = [];

  try {
    const news = await fetchGoogleNews(company.newsQuery, NEWS_PER_COMPANY);
    results.push(...news);
  } catch (err) {
    console.error(`  [뉴스 실패] ${company.name}: ${err.message}`);
  }

  if (company.newsroom) {
    try {
      const newsroom = await fetchNewsroom(company);
      results.push(...newsroom);
    } catch (err) {
      console.error(`  [뉴스룸 실패] ${company.name}: ${err.message}`);
    }
  }

  return results;
}

function recentTitlesFor(company, existingActivities) {
  return existingActivities
    .filter((a) => a.company === company)
    .sort((a, b) => new Date(b.pubDate || b.processedAt) - new Date(a.pubDate || a.processedAt))
    .slice(0, 5)
    .map((a) => a.keyMessage || a.title);
}

async function main() {
  const existing = await loadExisting();
  const existingIds = new Set(existing.activities.map((a) => a.id));
  const companies = COMPANIES.slice(0, COMPANY_LIMIT);

  console.log(`대상 기업 ${companies.length}곳, Gemini 사용: ${USE_GEMINI ? "예" : "아니오 (키 없음, 최소 정보만 저장)"}`);

  let llmCallsUsed = 0;
  const newActivities = [];

  for (const company of companies) {
    console.log(`\n[${company.name}] 수집 중...`);
    const rawItems = await gatherRawItems(company);

    const seenInRun = new Set();
    const candidates = [];
    for (const item of rawItems) {
      if (!item.link) continue;
      const id = idFor(item.link);
      if (existingIds.has(id) || seenInRun.has(id)) continue;
      seenInRun.add(id);
      candidates.push({ ...item, id });
    }
    console.log(`  후보 ${rawItems.length}건 중 신규 ${candidates.length}건`);

    for (const [idx, item] of candidates.entries()) {
      if (llmCallsUsed >= MAX_LLM_CALLS_PER_RUN) {
        console.log("  Gemini 호출 상한 도달, 나머지는 다음 실행으로 넘김");
        break;
      }
      console.log(`  [${idx + 1}/${candidates.length}] ${item.title}`);

      let extracted = { finalUrl: item.link, title: item.title, textContent: "", keyVisual: null, publishedTime: null };
      try {
        extracted = await extractArticle(item.link);
      } catch (err) {
        console.error(`  [본문 추출 실패] ${item.title}: ${err.message}`);
      }

      let llmResult;
      if (USE_GEMINI) {
        try {
          llmResult = await extractActivity({
            company: company.name,
            category: company.category,
            title: extracted.title || item.title,
            publisher: item.publisher,
            textContent: extracted.textContent,
            recentTitles: recentTitlesFor(company.name, existing.activities),
          });
          llmCallsUsed += 1;
        } catch (err) {
          console.error(`  [Gemini 실패] ${item.title}: ${err.message}`);
          llmResult = fallbackActivity(extracted.title || item.title);
        }
      } else {
        llmResult = fallbackActivity(extracted.title || item.title);
      }

      const { llmAnomalyNote, ...activityFields } = llmResult;
      newActivities.push({
        id: item.id,
        company: company.name,
        category: company.category,
        sourceType: item.sourceType,
        title: extracted.title || item.title,
        link: extracted.finalUrl || item.link,
        publisher: item.publisher,
        pubDate: item.pubDate || extracted.publishedTime || new Date().toISOString(),
        keyVisual: extracted.keyVisual,
        ...activityFields,
        anomaly: { statisticalSpike: false, llmNote: llmAnomalyNote },
        processedAt: new Date().toISOString(),
      });
    }
  }

  const merged = [...existing.activities, ...newActivities];
  annotateStatisticalSpikes(merged);
  merged.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  const payload = {
    updatedAt: new Date().toISOString(),
    categories: [CATEGORY_IT, CATEGORY_FINANCE],
    companies: COMPANIES.map((c) => ({ name: c.name, category: c.category })),
    activityTypes: ACTIVITY_TYPES,
    activities: merged,
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf-8");

  console.log(
    `\n신규 ${newActivities.length}건 저장 (Gemini 호출 ${llmCallsUsed}회), 전체 ${merged.length}건 -> ${OUTPUT_PATH}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
