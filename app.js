const NEIS_KEY = "ed50e755df5d42d4b94db728feab7952";
const NEIS_BASE = "https://open.neis.go.kr/hub";

const STORAGE_KEYS = {
  selectedSchool: "neis_selected_school_v1",
  schoolSearchCache: "neis_school_search_cache_v1",
  settings: "neis_settings_v1",
};

const el = {
  query: document.getElementById("schoolQuery"),
  results: document.getElementById("schoolResults"),
  picked: document.getElementById("pickedSchool"),
  grade: document.getElementById("grade"),
  className: document.getElementById("className"),
  date: document.getElementById("date"),
  refresh: document.getElementById("refresh"),
  clearSchool: document.getElementById("clearSchool"),
  status: document.getElementById("status"),
  meal: document.getElementById("meal"),
  timetable: document.getElementById("timetable"),
};

function ymdToIso(ymd) {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

function isoToYmd(iso) {
  return iso.replaceAll("-", "");
}

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function setStatus(message, kind = "muted") {
  el.status.className = `hint ${kind === "error" ? "error" : kind === "ok" ? "ok" : ""}`;
  el.status.textContent = message;
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function renderPickedSchool(school) {
  if (!school) {
    el.picked.textContent = "선택된 학교 없음";
    return;
  }
  el.picked.textContent = `선택됨: ${school.schoolName} (${school.schoolKind})`;
}

function renderSchoolResults(items) {
  el.results.innerHTML = "";
  if (!items.length) {
    el.results.innerHTML = `<div class="hint">검색 결과가 없어요.</div>`;
    return;
  }
  for (const item of items) {
    const div = document.createElement("div");
    div.className = "result";
    div.innerHTML = `
      <div class="result__top">
        <div class="result__name">${escapeHtml(item.schoolName)}</div>
        <span class="badge">${escapeHtml(item.schoolKind || "학교")}</span>
      </div>
      <div class="result__addr">${escapeHtml(item.address || "")}</div>
      <div class="result__actions">
        <button class="btn btn--ghost" type="button">선택</button>
      </div>
    `;
    div.querySelector("button").addEventListener("click", () => {
      saveJson(STORAGE_KEYS.selectedSchool, item);
      renderPickedSchool(item);
      setStatus("학교를 선택했어요. 학년/반을 입력하고 가져오기를 눌러주세요.", "ok");
      el.results.innerHTML = "";
    });
    el.results.appendChild(div);
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getCachedSearch() {
  return loadJson(STORAGE_KEYS.schoolSearchCache, {});
}

function setCachedSearch(query, items) {
  const cache = getCachedSearch();
  cache[query] = { items, ts: Date.now() };
  saveJson(STORAGE_KEYS.schoolSearchCache, cache);
}

function readSettings() {
  return loadJson(STORAGE_KEYS.settings, { grade: "", className: "" });
}

function writeSettings(next) {
  saveJson(STORAGE_KEYS.settings, next);
}

function pickTimetableEndpoint(schoolKindName) {
  if (typeof schoolKindName !== "string") return "hisTimetable";
  if (schoolKindName.includes("초등")) return "elsTimetable";
  if (schoolKindName.includes("중")) return "misTimetable";
  if (schoolKindName.includes("고")) return "hisTimetable";
  return "hisTimetable";
}

async function neisGet(endpoint, params) {
  const url = new URL(`${NEIS_BASE}/${endpoint}`);
  url.searchParams.set("KEY", NEIS_KEY);
  url.searchParams.set("Type", "json");
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  const resp = await fetch(url, { method: "GET" });
  if (!resp.ok) throw new Error(`NEIS HTTP ${resp.status}`);
  const data = await resp.json();

  const result = data?.RESULT;
  if (result?.CODE) {
    if (result.CODE === "INFO-200") return null; // 데이터 없음
    if (result.CODE !== "INFO-000") {
      const error = new Error(`${result.CODE}: ${result.MESSAGE || "NEIS error"}`);
      error.code = result.CODE;
      throw error;
    }
  }
  return data;
}

let debounceTimer = null;
async function handleSearch() {
  const q = el.query.value.trim();
  if (q.length < 2) {
    el.results.innerHTML = "";
    return;
  }

  const cache = getCachedSearch();
  const hit = cache[q];
  if (hit?.items) {
    renderSchoolResults(hit.items);
    return;
  }

  setStatus("학교 검색 중...", "muted");
  try {
    const data = await neisGet("schoolInfo", { SCHUL_NM: q, pIndex: 1, pSize: 50 });
    const rows = data?.schoolInfo?.[1]?.row ?? [];
    const items = rows.map((r) => ({
      schoolName: r.SCHUL_NM,
      eduOfficeCode: r.ATPT_OFCDC_SC_CODE,
      schoolCode: r.SD_SCHUL_CODE,
      schoolKind: r.SCHUL_KND_SC_NM,
      address: r.ORG_RDNMA,
    }));
    setCachedSearch(q, items);
    renderSchoolResults(items);
    setStatus("검색 완료", "ok");
  } catch (e) {
    setStatus(`검색 실패: ${e.message}`, "error");
  }
}

async function refresh() {
  const school = loadJson(STORAGE_KEYS.selectedSchool, null);
  if (!school) {
    setStatus("먼저 학교를 선택해 주세요.", "error");
    return;
  }

  const grade = el.grade.value.trim();
  const className = el.className.value.trim();
  if (!grade || !className) {
    setStatus("학년/반을 입력해 주세요.", "error");
    return;
  }

  writeSettings({ grade, className });

  const iso = el.date.value || todayIso();
  const ymd = isoToYmd(iso);

  setStatus("가져오는 중...", "muted");
  el.meal.innerHTML = `<div class="hint">로딩 중...</div>`;
  el.timetable.innerHTML = `<div class="hint">로딩 중...</div>`;

  const endpoint = pickTimetableEndpoint(school.schoolKind);

  const [mealResult, ttResult] = await Promise.allSettled([
    neisGet("mealServiceDietInfo", {
      ATPT_OFCDC_SC_CODE: school.eduOfficeCode,
      SD_SCHUL_CODE: school.schoolCode,
      MLSV_YMD: ymd,
      pIndex: 1,
      pSize: 50,
    }),
    neisGet(endpoint, {
      ATPT_OFCDC_SC_CODE: school.eduOfficeCode,
      SD_SCHUL_CODE: school.schoolCode,
      AY: ymd.slice(0, 4),
      GRADE: grade,
      CLASS_NM: className,
      ALL_TI_YMD: ymd,
      pIndex: 1,
      pSize: 100,
    }),
  ]);

  // 급식
  if (mealResult.status === "fulfilled") {
    const mealRows = mealResult.value?.mealServiceDietInfo?.[1]?.row ?? [];
    const mealItems = mealRows.map((r) => ({
      date: r.MLSV_YMD,
      mealName: r.MMEAL_SC_NM,
      dishesHtml: r.DDISH_NM,
      calories: r.CAL_INFO,
    }));
    renderMeal(mealItems, iso);
  } else {
    el.meal.innerHTML = `<div class="error">급식 불러오기 실패: ${mealResult.reason?.message}</div>`;
  }

  // 시간표
  if (ttResult.status === "fulfilled") {
    const ttRows = ttResult.value?.[endpoint]?.[1]?.row ?? [];
    const ttItems = ttRows
      .map((r) => ({ date: r.ALL_TI_YMD, period: r.PERIO, subject: r.ITRT_CNTNT }))
      .sort((a, b) => Number(a.period) - Number(b.period));
    renderTimetable(ttItems, iso);
  } else {
    el.timetable.innerHTML = `<div class="error">시간표 불러오기 실패: ${ttResult.reason?.message}</div>`;
  }

  const bothOk = mealResult.status === "fulfilled" && ttResult.status === "fulfilled";
  setStatus(bothOk ? "완료" : "일부 데이터를 불러오지 못했어요.", bothOk ? "ok" : "muted");
}

function renderMeal(items, isoDate) {
  if (!items.length) {
    el.meal.innerHTML = `<div class="hint">${isoDate} 급식 정보가 없어요.</div>`;
    return;
  }
  const html = items
    .map((m) => {
      const dishes = (m.dishesHtml || "")
        .split("<br/>")
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => `<li>${escapeHtml(x.replace(/\s+/g, " "))}</li>`)
        .join("");
      return `
        <div class="period">
          <div class="period__num">${escapeHtml(m.mealName || "")}</div>
          <div class="period__subj"><ul class="list">${dishes}</ul></div>
        </div>
      `;
    })
    .join("");
  el.meal.innerHTML = `<div class="list">${html}</div>`;
}

function renderTimetable(items, isoDate) {
  if (!items.length) {
    el.timetable.innerHTML = `<div class="hint">${isoDate} 시간표 정보가 없어요.</div>`;
    return;
  }
  const html = items
    .map((t) => {
      return `
        <div class="period">
          <div class="period__num">${escapeHtml(t.period)}교시</div>
          <div class="period__subj">${escapeHtml(t.subject)}</div>
        </div>
      `;
    })
    .join("");
  el.timetable.innerHTML = `<div class="list">${html}</div>`;
}

function init() {
  el.date.value = todayIso();

  const savedSchool = loadJson(STORAGE_KEYS.selectedSchool, null);
  renderPickedSchool(savedSchool);

  const settings = readSettings();
  el.grade.value = settings.grade || "";
  el.className.value = settings.className || "";

  el.query.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(handleSearch, 250);
  });

  el.refresh.addEventListener("click", refresh);
  el.clearSchool.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEYS.selectedSchool);
    renderPickedSchool(null);
    setStatus("학교 선택을 초기화했어요.", "ok");
  });

  setStatus("학교를 검색해서 선택해 주세요.", "muted");
}

init();
