import * as cheerio from "cheerio";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const ITEM_LIMIT = 15;

// 회사 뉴스룸/보도자료 목록 페이지는 사이트마다 구조가 제각각이라 본문 목록을 정교하게
// 파싱하지 않는다. 대신 linkPattern에 매칭되는 href만 "진짜 기사 링크" 후보로 채택해
// URL만 확보하고, 실제 제목/본문은 이후 extractContent 단계에서 기사 페이지 자체를
// 다시 읽어 뽑아낸다 (그래서 여기서는 링크 텍스트를 굳이 정제하지 않는다).
export async function fetchNewsroom(company) {
  const { newsroom, name } = company;
  if (!newsroom) return [];

  const res = await fetch(newsroom.url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  const seen = new Set();
  const items = [];

  $("a").each((_, el) => {
    if (items.length >= ITEM_LIMIT) return;
    const href = $(el).attr("href") || "";
    if (!newsroom.linkPattern.test(href)) return;

    const absoluteUrl = new URL(href, newsroom.url).toString();
    if (seen.has(absoluteUrl)) return;
    seen.add(absoluteUrl);

    const text = $(el).text().trim().replace(/\s+/g, " ");
    items.push({
      sourceType: "newsroom",
      title: text || `${name} 뉴스룸 게시물`,
      link: absoluteUrl,
      publisher: name,
      pubDate: "", // 목록 페이지에서 신뢰할 만한 날짜를 못 뽑아 비워두고, extractContent에서 보완 시도
    });
  });

  return items;
}
