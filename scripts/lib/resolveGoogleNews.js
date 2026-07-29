const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

function isGoogleNewsLink(url) {
  return /^https:\/\/news\.google\.com\/rss\/articles\//.test(url);
}

// Google 뉴스 RSS의 <link>는 실제 기사가 아니라 JS로 진짜 URL을 알아내는 중간 페이지다.
// 인터스티셜 페이지의 data-n-a-* 속성(기사 id/서명/타임스탬프)을 읽어, 구글 뉴스가 쓰는
// 내부 batchexecute RPC(Fbv4je)에 그대로 재요청해 실제 기사 URL을 얻어낸다.
// 비공식 방식이라 구글이 형식을 바꾸면 깨질 수 있어, 실패하면 조용히 null을 반환한다
// (호출부에서 원래 RSS 링크로 폴백하도록).
export async function resolveGoogleNewsLink(url) {
  if (!isGoogleNewsLink(url)) return url;

  try {
    const page = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(15000) });
    const html = await page.text();

    const id = html.match(/data-n-a-id="([^"]+)"/)?.[1];
    const sg = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
    const ts = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
    if (!id || !sg || !ts) return null;

    const inner = JSON.stringify([
      "garturlreq",
      [["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1], "X", "X", 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0],
      id,
      Number(ts),
      sg,
    ]);
    const freq = JSON.stringify([[["Fbv4je", inner]]]);

    const res = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": USER_AGENT,
      },
      body: "f.req=" + encodeURIComponent(freq),
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    const match = text.match(/"garturlres\\?",\\?"([^"\\]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
