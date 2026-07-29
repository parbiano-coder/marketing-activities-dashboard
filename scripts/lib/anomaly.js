const DAY_MS = 24 * 60 * 60 * 1000;

function isWithinDays(pubDate, now, days) {
  const t = new Date(pubDate).getTime();
  if (Number.isNaN(t)) return false;
  const age = now - t;
  return age >= 0 && age <= days * DAY_MS;
}

// 회사별 최근 7일 활동 수가 직전 4주 평균의 2배 이상이면 급증(statisticalSpike)으로 표시한다.
// LLM 호출 없이 이미 저장된 pubDate만으로 계산하므로 매 실행마다 전체 데이터에 대해 다시 계산해도 무료.
export function annotateStatisticalSpikes(activities) {
  const byCompany = new Map();
  for (const a of activities) {
    if (!byCompany.has(a.company)) byCompany.set(a.company, []);
    byCompany.get(a.company).push(a);
    a.anomaly = a.anomaly ?? { statisticalSpike: false, llmNote: null };
    a.anomaly.statisticalSpike = false; // 매 실행마다 재계산
  }

  const now = Date.now();
  for (const items of byCompany.values()) {
    const recentCount = items.filter((a) => isWithinDays(a.pubDate, now, 7)).length;
    const priorCount = items.filter(
      (a) => isWithinDays(a.pubDate, now, 35) && !isWithinDays(a.pubDate, now, 7)
    ).length;
    const priorWeeklyAvg = priorCount / 4;
    const isSpike = priorWeeklyAvg > 0 ? recentCount >= priorWeeklyAvg * 2 : recentCount >= 3;

    if (isSpike) {
      for (const a of items) {
        if (isWithinDays(a.pubDate, now, 7)) a.anomaly.statisticalSpike = true;
      }
    }
  }

  return activities;
}
