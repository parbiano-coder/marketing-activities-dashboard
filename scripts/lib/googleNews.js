import { XMLParser } from "fast-xml-parser";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function textOf(value) {
  if (value == null) return "";
  if (typeof value === "object") return String(value["#text"] ?? "");
  return String(value);
}

// Google News titles are formatted as "실제 제목 - 언론사명"
function splitTitleAndSource(rawTitle) {
  const idx = rawTitle.lastIndexOf(" - ");
  if (idx === -1) return { title: rawTitle, source: "" };
  return { title: rawTitle.slice(0, idx), source: rawTitle.slice(idx + 3) };
}

function buildFeedUrl(query) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
}

export async function fetchGoogleNews(query, limit = 10) {
  const url = buildFeedUrl(query);
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const xml = await res.text();
  const parsed = parser.parse(xml);
  const rawItems = parsed?.rss?.channel?.item ?? [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];

  return items.slice(0, limit).map((item) => {
    const { title, source: titleSource } = splitTitleAndSource(textOf(item.title).trim());
    const source = textOf(item.source).trim() || titleSource || "알 수 없음";
    return {
      sourceType: "news",
      title,
      link: textOf(item.link).trim(),
      publisher: source,
      pubDate: textOf(item.pubDate).trim(),
    };
  });
}
