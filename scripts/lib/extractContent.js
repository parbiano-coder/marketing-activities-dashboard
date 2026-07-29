import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { resolveGoogleNewsLink } from "./resolveGoogleNews.js";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const MAX_TEXT_LENGTH = 4000; // Gemini에 보낼 본문 길이 상한 (토큰 절약)

function metaContent(doc, selectors) {
  for (const sel of selectors) {
    const val = doc.querySelector(sel)?.getAttribute("content");
    if (val) return val;
  }
  return null;
}

// 기사/게시물 페이지를 가져와 본문 텍스트, 대표 이미지, 게시일을 뽑는다.
// Google News 링크는 실제 언론사 페이지로 리다이렉트되므로 fetch가 그 리다이렉트를 따라간다.
export async function extractArticle(url) {
  const resolvedUrl = await resolveGoogleNewsLink(url);
  if (!resolvedUrl) {
    // 구글 뉴스 링크 해석에 실패한 경우: 인터스티셜 페이지를 긁어봤자 의미 없는 내용만
    // 나오므로, 본문 추출은 포기하고 제목/링크만으로 처리하도록 호출부에 알린다.
    throw new Error("구글 뉴스 링크 해석 실패");
  }

  const res = await fetch(resolvedUrl, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const finalUrl = res.url || resolvedUrl;

  const dom = new JSDOM(html, { url: finalUrl });
  const doc = dom.window.document;

  const keyVisual = metaContent(doc, ['meta[property="og:image"]', 'meta[name="twitter:image"]']);
  const ogTitle = metaContent(doc, ['meta[property="og:title"]']) || doc.title || null;
  const publishedTime = metaContent(doc, [
    'meta[property="article:published_time"]',
    'meta[name="publish-date"]',
    'meta[itemprop="datePublished"]',
  ]);

  let textContent = "";
  try {
    // Readability가 document를 변형하므로 파싱은 메타데이터를 다 뽑은 뒤에 실행한다.
    const article = new Readability(doc).parse();
    textContent = (article?.textContent || "").trim().slice(0, MAX_TEXT_LENGTH);
  } catch {
    // 본문 추출 실패 시 빈 본문으로 두고, Gemini 단계에서 제목만으로 최소 추출 시도
  }

  return { finalUrl, title: ogTitle, textContent, keyVisual, publishedTime };
}
