# 마케팅 활동 모니터링 대시보드

국내 IT서비스·디지털금융 기업(총 19곳)의 행사·전시·웨비나·신제품 출시·언론보도·고객사례 등
마케팅 활동을 매일 자동으로 수집하고, Google Gemini로 언제·어디서·어떻게 + 슬로건·핵심
메시지·대표 이미지를 뽑아내고 특이점(평소보다 활동이 급증했는지, LLM이 보기에 눈에 띄는
변화가 있는지)까지 분석해 보여주는 정적 대시보드입니다.

- **IT 서비스**: 삼성SDS, LG CNS, SK AX, 네이버, 카카오, NHN, 더존비즈온, 한글과컴퓨터, KT, 네이버클라우드
- **디지털 금융**: 두나무, 빗썸코리아, 코인원, 카카오페이, 네이버파이낸셜, 토스, 코빗, 고팍스, 컴투스

## 어떻게 동작하나

1. `scripts/sources.js`에 정의된 회사별 Google 뉴스 검색과, 정적 HTML에서 실제 기사 링크를
   뽑아낼 수 있는 걸로 확인된 5개 회사(삼성SDS·NHN·더존비즈온·두나무·토스)의 공식
   뉴스룸/블로그를 수집합니다. (나머지 14개사는 뉴스룸이 JS로 렌더링되거나 Cloudflare로
   막혀있어 무료·경량 방식으로는 못 읽어서 구글 뉴스만 사용합니다.)
2. Google 뉴스 링크는 실제 기사가 아니라 중간 리다이렉트 페이지라서,
   [`scripts/lib/resolveGoogleNews.js`](scripts/lib/resolveGoogleNews.js)가 구글 뉴스 내부
   API를 통해 실제 기사 URL로 변환합니다.
3. 새로 발견된(이전에 처리한 적 없는) 항목만 [`scripts/lib/extractContent.js`](scripts/lib/extractContent.js)로
   본문과 대표 이미지(og:image)를 가져옵니다.
4. [`scripts/lib/gemini.js`](scripts/lib/gemini.js)가 Gemini에 본문 + 이 회사의 최근 활동
   맥락을 함께 보내 활동 유형/일시/장소/방식/슬로건/핵심 메시지/특이점을 JSON으로 받습니다.
5. [`scripts/lib/anomaly.js`](scripts/lib/anomaly.js)가 회사별 최근 7일 활동 수를 직전 4주
   평균과 비교해 통계적 급증도 함께 표시합니다 (LLM 호출 없이 무료로 계산).
6. 결과를 `data/activities.json`에 누적 저장하고, `index.html`이 이를 불러와 카테고리 →
   기업 → 활동유형 3단 필터와 함께 보여줍니다.

## 로컬에서 실행하기

```bash
npm install
```

Gemini 키가 있다면 (`.env` 파일 대신) **그 터미널 세션에서만** 설정하고 실행하세요.
공용 PC라면 이 방식이 안전합니다 — 창을 닫으면 사라지고 디스크에 남지 않습니다.

```powershell
$env:GEMINI_API_KEY = "발급받은 키"
npm run collect
```

키가 없어도 `npm run collect`는 동작합니다 (뉴스/뉴스룸 수집·본문 추출까지는 되고, Gemini
분석 필드만 비워둔 채 저장됩니다).

로컬에서 대시보드를 보려면:

```bash
npx serve .
```

## ⚠️ Gemini 무료 티어 관련 주의사항

이 프로젝트에서 실제로 발급받아 테스트해본 결과, Google AI Studio의 "Default Gemini
Project"류 계정은 **모델과 무관하게 하루 약 20건**이라는 낮은 공용 한도를 가질 수 있습니다
(공식 문서에 명시된 모델별 한도보다 훨씬 낮음). 이를 감안해:

- `scripts/collect.js`의 `MAX_LLM_CALLS_PER_RUN` 기본값을 15로 낮춰뒀습니다 (환경변수로 조정 가능)
- `scripts/lib/gemini.js`가 호출 사이 최소 간격(기본 8초, `GEMINI_MIN_INTERVAL_MS`로 조정)을
  두고, 429 응답에 포함된 `retryDelay`만큼 기다렸다가 한 번 재시도합니다
- 그래도 실패하면 해당 항목은 `activityType: "기타"`, `keyMessage: 제목` 정도의 최소 정보로
  저장되고, **다시는 재처리되지 않습니다** (링크 해시로 중복 처리를 막기 때문). 더 나은 무료
  한도가 필요하면 Google Cloud Console에서 별도 프로젝트+API 키를 새로 만드는 것도 방법입니다.
- 기본 모델은 `gemini-3.6-flash`이며 `GEMINI_MODEL` 환경변수로 바꿀 수 있습니다. (테스트 중
  `gemini-2.5-flash-lite`는 이 계정에서 "신규 사용자에게 더 이상 제공되지 않는 모델"로
  404가 났습니다 — Gemini 모델 라인업은 자주 바뀌니 문제가 생기면
  [pricing 페이지](https://ai.google.dev/gemini-api/docs/pricing)에서 현재 무료 티어 모델명을
  확인하세요.)

## GitHub에 배포하는 방법

1. 새 저장소를 만들고 push
2. **Settings → Actions → General → Workflow permissions**을 "Read and write permissions"로 설정
3. **Settings → Secrets and variables → Actions**에서 `GEMINI_API_KEY` secret 등록
4. **Settings → Pages**에서 Source: `Deploy from a branch`, Branch: `main` / `(root)`
5. **Actions** 탭에서 `Collect Marketing Activities` 워크플로우 수동 실행

이후 매일 1회(UTC 21:00 = 한국시간 오전 6시경) 자동으로 수집·분석·배포됩니다.

## 카테고리 / 기업 / 소스 변경하기

- 대상 기업·뉴스룸: [`scripts/sources.js`](scripts/sources.js)
- 키워드/활동유형 분류: [`scripts/lib/gemini.js`](scripts/lib/gemini.js)의 `ACTIVITY_TYPES`,
  `responseSchema`
- 수집 주기: [`.github/workflows/collect.yml`](.github/workflows/collect.yml)의 `cron`
- 회사당 뉴스 수집 개수: `scripts/collect.js`의 `NEWS_PER_COMPANY`
