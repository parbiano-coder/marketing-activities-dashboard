const DATA_URL = "data/activities.json";
const ALL = "전체";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const state = {
  activities: [],
  categories: [],
  companies: [], // [{ name, category }]
  activityTypes: [],
  activeCategory: ALL,
  activeCompany: ALL,
  activeType: ALL,
  onlyAnomaly: false,
  query: "",
};

const els = {
  updatedAt: document.getElementById("updatedAt"),
  statRow: document.getElementById("statRow"),
  categoryFilters: document.getElementById("categoryFilters"),
  companyFilters: document.getElementById("companyFilters"),
  typeFilters: document.getElementById("typeFilters"),
  anomalyToggle: document.getElementById("anomalyToggle"),
  searchInput: document.getElementById("searchInput"),
  statusMessage: document.getElementById("statusMessage"),
  activityList: document.getElementById("activityList"),
};

function seriesVarForCategory(category) {
  const index = state.categories.indexOf(category);
  if (index === -1) return "var(--text-muted)";
  return `var(--series-${(index % 2) + 1})`;
}

function companyCategory(companyName) {
  return state.companies.find((c) => c.name === companyName)?.category;
}

function isAnomaly(activity) {
  return Boolean(activity.anomaly?.statisticalSpike || activity.anomaly?.llmNote);
}

function formatDate(pubDate) {
  const d = new Date(pubDate);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function makeFilterButton(label, isActive, dotColorVar, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "filter-btn";
  btn.setAttribute("aria-pressed", String(isActive));
  if (dotColorVar) btn.style.setProperty("--dot-color", dotColorVar);

  const dot = document.createElement("span");
  dot.className = "dot";
  btn.appendChild(dot);
  btn.appendChild(document.createTextNode(label));

  btn.addEventListener("click", onClick);
  return btn;
}

function renderStats() {
  const now = Date.now();
  const weekCount = state.activities.filter((a) => {
    const t = new Date(a.pubDate).getTime();
    return !Number.isNaN(t) && now - t <= WEEK_MS && now - t >= 0;
  }).length;
  const anomalyCount = state.activities.filter(isAnomaly).length;

  els.statRow.innerHTML = "";
  for (const [value, label] of [
    [weekCount, "이번 주 활동"],
    [anomalyCount, "특이 활동"],
  ]) {
    const tile = document.createElement("div");
    tile.className = "stat-tile";
    tile.innerHTML = `<span class="value">${value}</span><span class="label">${label}</span>`;
    els.statRow.appendChild(tile);
  }
}

// 카테고리/기업/특이여부(활동유형 필터 적용 전) 기준으로 좁힌 활동 목록.
function activitiesForTypeScope() {
  return state.activities.filter((a) => {
    const matchesCategory = state.activeCategory === ALL || a.category === state.activeCategory;
    const matchesCompany = state.activeCompany === ALL || a.company === state.activeCompany;
    const matchesAnomaly = !state.onlyAnomaly || isAnomaly(a);
    return matchesCategory && matchesCompany && matchesAnomaly;
  });
}

function renderCategoryFilters() {
  els.categoryFilters.innerHTML = "";
  const options = [ALL, ...state.categories];

  for (const category of options) {
    const dotColorVar = category === ALL ? null : seriesVarForCategory(category);
    const btn = makeFilterButton(category, category === state.activeCategory, dotColorVar, () => {
      state.activeCategory = category;
      state.activeCompany = ALL;
      state.activeType = ALL;
      renderCategoryFilters();
      renderCompanyFilters();
      renderTypeFilters();
      renderActivities();
    });
    els.categoryFilters.appendChild(btn);
  }
}

function renderCompanyFilters() {
  els.companyFilters.innerHTML = "";

  const visibleCompanies =
    state.activeCategory === ALL
      ? state.companies
      : state.companies.filter((c) => c.category === state.activeCategory);

  const options = [ALL, ...visibleCompanies.map((c) => c.name)];

  for (const company of options) {
    const category = company === ALL ? null : companyCategory(company);
    const dotColorVar = category ? seriesVarForCategory(category) : null;
    const btn = makeFilterButton(company, company === state.activeCompany, dotColorVar, () => {
      state.activeCompany = company;
      state.activeType = ALL;
      renderCompanyFilters();
      renderTypeFilters();
      renderActivities();
    });
    els.companyFilters.appendChild(btn);
  }
}

function renderTypeFilters() {
  els.typeFilters.innerHTML = "";

  const scoped = activitiesForTypeScope();
  const counts = new Map();
  for (const a of scoped) counts.set(a.activityType, (counts.get(a.activityType) ?? 0) + 1);

  const availableTypes = state.activityTypes.filter((t) => counts.has(t));
  if (availableTypes.length === 0) return;

  const totalBtn = makeFilterButton(`${ALL} (${scoped.length})`, state.activeType === ALL, null, () => {
    state.activeType = ALL;
    renderTypeFilters();
    renderActivities();
  });
  els.typeFilters.appendChild(totalBtn);

  for (const type of availableTypes) {
    const label = `${type} (${counts.get(type)})`;
    const btn = makeFilterButton(label, state.activeType === type, null, () => {
      state.activeType = state.activeType === type ? ALL : type;
      renderTypeFilters();
      renderActivities();
    });
    els.typeFilters.appendChild(btn);
  }
}

function contextLine(a) {
  const parts = [a.eventDate, a.location, a.format].filter(Boolean);
  return parts.join(" · ");
}

function renderActivities() {
  const query = state.query.trim().toLowerCase();

  const filtered = state.activities.filter((a) => {
    const matchesCategory = state.activeCategory === ALL || a.category === state.activeCategory;
    const matchesCompany = state.activeCompany === ALL || a.company === state.activeCompany;
    const matchesType = state.activeType === ALL || a.activityType === state.activeType;
    const matchesAnomaly = !state.onlyAnomaly || isAnomaly(a);
    const haystack = `${a.title} ${a.slogan ?? ""} ${a.keyMessage ?? ""}`.toLowerCase();
    const matchesQuery = !query || haystack.includes(query);
    return matchesCategory && matchesCompany && matchesType && matchesAnomaly && matchesQuery;
  });

  els.activityList.innerHTML = "";

  if (filtered.length === 0) {
    els.statusMessage.hidden = false;
    els.statusMessage.textContent = "표시할 활동이 없습니다.";
    return;
  }
  els.statusMessage.hidden = true;

  const fragment = document.createDocumentFragment();
  for (const a of filtered) {
    const li = document.createElement("li");
    li.className = "activity-card";

    if (a.keyVisual) {
      const img = document.createElement("img");
      img.className = "activity-thumb";
      img.src = a.keyVisual;
      img.alt = "";
      img.loading = "lazy";
      img.addEventListener("error", () => img.remove());
      li.appendChild(img);
    }

    const body = document.createElement("div");
    body.className = "activity-body";

    const meta = document.createElement("div");
    meta.className = "activity-meta";

    const badge = document.createElement("span");
    badge.className = "company-badge";
    badge.style.setProperty("--badge-color", seriesVarForCategory(a.category));
    badge.textContent = `${a.category} · ${a.company}`;
    meta.appendChild(badge);

    const typeBadge = document.createElement("span");
    typeBadge.className = "type-badge";
    typeBadge.textContent = a.activityType;
    meta.appendChild(typeBadge);

    if (isAnomaly(a)) {
      const anomalyBadge = document.createElement("span");
      anomalyBadge.className = "anomaly-badge";
      anomalyBadge.textContent = "⚠ 특이 활동";
      meta.appendChild(anomalyBadge);
    }

    meta.appendChild(document.createTextNode(a.publisher || ""));
    const dateText = formatDate(a.pubDate);
    if (dateText) meta.appendChild(document.createTextNode(" · " + dateText));

    const titleEl = document.createElement("p");
    titleEl.className = "activity-title";
    const link = document.createElement("a");
    link.href = a.link;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = a.title;
    titleEl.appendChild(link);

    body.appendChild(meta);
    body.appendChild(titleEl);

    if (a.slogan) {
      const slogan = document.createElement("p");
      slogan.className = "activity-slogan";
      slogan.textContent = `“${a.slogan}”`;
      body.appendChild(slogan);
    }

    if (a.keyMessage) {
      const msg = document.createElement("p");
      msg.className = "activity-message";
      msg.textContent = a.keyMessage;
      body.appendChild(msg);
    }

    if (a.anomaly?.llmNote) {
      const note = document.createElement("p");
      note.className = "activity-anomaly-note";
      note.textContent = `⚠ ${a.anomaly.llmNote}`;
      body.appendChild(note);
    }

    const context = contextLine(a);
    if (context) {
      const ctx = document.createElement("p");
      ctx.className = "activity-context";
      ctx.textContent = context;
      body.appendChild(ctx);
    }

    li.appendChild(body);
    fragment.appendChild(li);
  }
  els.activityList.appendChild(fragment);
}

async function init() {
  try {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    state.activities = data.activities ?? [];
    state.categories = data.categories ?? [];
    state.companies = data.companies ?? [];
    state.activityTypes = data.activityTypes ?? [];

    const updated = new Date(data.updatedAt);
    els.updatedAt.textContent = Number.isNaN(updated.getTime())
      ? ""
      : `마지막 업데이트: ${updated.toLocaleString("ko-KR")}`;

    renderStats();
    renderCategoryFilters();
    renderCompanyFilters();
    renderTypeFilters();
    renderActivities();
  } catch (err) {
    els.updatedAt.textContent = "";
    els.statusMessage.hidden = false;
    els.statusMessage.textContent = "데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
    console.error(err);
  }
}

els.searchInput.addEventListener("input", (e) => {
  state.query = e.target.value;
  renderActivities();
});

els.anomalyToggle.addEventListener("click", () => {
  state.onlyAnomaly = !state.onlyAnomaly;
  els.anomalyToggle.setAttribute("aria-pressed", String(state.onlyAnomaly));
  renderTypeFilters();
  renderActivities();
});

init();
