export const CATEGORY_IT = "IT 서비스";
export const CATEGORY_FINANCE = "디지털 금융";

// newsroom: 정적 HTML에서 기사 링크를 뽑을 수 있는 걸 직접 확인한 회사만 등록했다.
// (JS로 렌더링되는 SPA이거나 Cloudflare 등으로 막힌 곳은 구글 뉴스만 사용)
// linkPattern에 매칭되는 href만 "진짜 기사 링크" 후보로 채택한다.
export const COMPANIES = [
  // IT 서비스
  {
    name: "삼성SDS",
    category: CATEGORY_IT,
    newsQuery: '"삼성SDS"',
    newsroom: {
      url: "https://www.samsungsds.com/kr/news/press_list.html",
      linkPattern: /\/kr\/news\/[a-z]+-\d{6}\.html/i,
    },
  },
  { name: "LG CNS", category: CATEGORY_IT, newsQuery: '"LG CNS"' },
  { name: "SK AX", category: CATEGORY_IT, newsQuery: '"SK AX" OR "SK C&C"' },
  { name: "네이버", category: CATEGORY_IT, newsQuery: '"네이버"' },
  { name: "카카오", category: CATEGORY_IT, newsQuery: '"카카오"' },
  {
    name: "NHN",
    category: CATEGORY_IT,
    newsQuery: '"NHN"',
    newsroom: {
      url: "https://inside.nhn.com/",
      linkPattern: /\/(tech|corp|service)\/\d+$/i,
    },
  },
  {
    name: "더존비즈온",
    category: CATEGORY_IT,
    newsQuery: '"더존비즈온"',
    newsroom: {
      url: "https://www.douzone.com/media/media_room.jsp",
      linkPattern: /media_room_read\.jsp\?id=\d+/i,
    },
  },
  { name: "한글과컴퓨터", category: CATEGORY_IT, newsQuery: '"한글과컴퓨터"' },
  { name: "KT", category: CATEGORY_IT, newsQuery: '"KT"' },
  { name: "네이버클라우드", category: CATEGORY_IT, newsQuery: '"네이버클라우드"' },

  // 디지털 금융 (스테이블코인 · 디지털자산)
  {
    name: "두나무",
    category: CATEGORY_FINANCE,
    newsQuery: '"두나무"',
    newsroom: {
      url: "https://www.dunamu.com/news",
      linkPattern: /\/news\/\d+/i,
    },
  },
  { name: "빗썸코리아", category: CATEGORY_FINANCE, newsQuery: '"빗썸코리아" OR "빗썸"' },
  { name: "코인원", category: CATEGORY_FINANCE, newsQuery: '"코인원"' },
  { name: "카카오페이", category: CATEGORY_FINANCE, newsQuery: '"카카오페이"' },
  { name: "네이버파이낸셜", category: CATEGORY_FINANCE, newsQuery: '"네이버파이낸셜"' },
  {
    name: "토스",
    category: CATEGORY_FINANCE,
    newsQuery: '"토스"',
    newsroom: {
      url: "https://blog.toss.im/category/newsroom/",
      linkPattern: /\/tossfeed\/article\//i,
    },
  },
  { name: "코빗", category: CATEGORY_FINANCE, newsQuery: '"코빗"' },
  { name: "고팍스", category: CATEGORY_FINANCE, newsQuery: '"고팍스"' },
  { name: "컴투스", category: CATEGORY_FINANCE, newsQuery: '"컴투스"' },
];
