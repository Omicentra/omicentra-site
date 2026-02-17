// /js/conferences.js
(() => {
  "use strict";

  const DATA_URL = "/data/conferences.json";
  const SEARCH_DEBOUNCE_MS = 200;

  const SOON_DAYS = 7;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  // --- helpers: safe DOM access ---
  function $(id){
    return document.getElementById(id);
  }

  function requireEl(id){
    const el = $(id);
    if (!el) throw new Error(`Missing element #${id} (check conferences.html ids)`);
    return el;
  }

  function setStatus(msg){
    const el = $("status");
    if (el) el.textContent = msg;
  }

  // If the page isn't conferences.html (or DOM isn't ready), do nothing.
  // (with defer it should be ready, but this prevents silent crashes on other pages)
  if (!$("grid") || !$("tbody")) return;

  let q, regionSel, topicSel, formatSel, deadlineSel, resetBtn;
  let viewCardsBtn, viewTableBtn;
  let grid, tableWrap, tbody, statusEl;
  let thName, thDates, thDeadline;

  try {
    q = requireEl("q");
    regionSel = requireEl("region");
    topicSel = requireEl("topic");
    formatSel = requireEl("format");
    deadlineSel = requireEl("deadline");
    resetBtn = requireEl("reset");

    viewCardsBtn = requireEl("viewCards");
    viewTableBtn = requireEl("viewTable");

    grid = requireEl("grid");
    tableWrap = requireEl("tablewrap");
    tbody = requireEl("tbody");
    statusEl = requireEl("status");

    thName = requireEl("th-name");
    thDates = requireEl("th-dates");
    thDeadline = requireEl("th-deadline");
  } catch (e) {
    console.error(e);
    setStatus(String(e.message || e));
    return;
  }

  let conferences = [];
  let currentView = "cards"; // "cards" | "table"

  let sortKey = "deadline";
  let sortDir = "asc";

  function escapeHtml(s){
    return String(s)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#39;");
  }

  function debounce(fn, delay){
    let t = null;
    return (...args) => {
      if (t) clearTimeout(t);
      t = setTimeout(() => fn(...args), delay);
    };
  }

  function isDateOnly(s){
    return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
  }

  function todayMidnight(){
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }

  function parseIsoMidnight(iso){
    if (!iso) return null;
    const t = Date.parse(iso + "T00:00:00"); // local midnight ok for start/end filtering
    return Number.isNaN(t) ? null : t;
  }

  function isPastOrOngoing(c){
    const today = todayMidnight();
    const start = parseIsoMidnight(c.start_date);
    const end = parseIsoMidnight(c.end_date);

    if (start === null && end === null) return false;

    if (start !== null && end === null) return start <= today;
    if (start === null && end !== null) return end < today;

    if (end < today) return true;
    if (start <= today && end >= today) return true;
    return false;
  }

  function formatDate(iso){
    if (!iso) return "TBA";
    const d = new Date(iso + "T00:00:00");
    if (Number.isNaN(d.getTime())) return "TBA";
    return d.toLocaleDateString(undefined, { year:"numeric", month:"short", day:"2-digit" });
  }

  function formatDateRange(startIso, endIso){
    if (!startIso && !endIso) return "TBA";
    if (startIso && !endIso) return formatDate(startIso);
    if (!startIso && endIso) return formatDate(endIso);

    const start = new Date(startIso + "T00:00:00");
    const end = new Date(endIso + "T00:00:00");
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "TBA";

    const sameYear = start.getFullYear() === end.getFullYear();
    const sameMonth = sameYear && start.getMonth() === end.getMonth();

    const sDay = start.toLocaleDateString(undefined, { day:"2-digit" });
    const sMon = start.toLocaleDateString(undefined, { month:"short" });
    const eDay = end.toLocaleDateString(undefined, { day:"2-digit" });
    const eMon = end.toLocaleDateString(undefined, { month:"short" });

    if (sameMonth){
      const year = start.getFullYear();
      return `${sDay} – ${eDay} ${eMon} ${year}`;
    }
    if (sameYear){
      const year = start.getFullYear();
      return `${sDay} ${sMon} – ${eDay} ${eMon} ${year}`;
    }
    return `${formatDate(startIso)} – ${formatDate(endIso)}`;
  }

  function toKey(s){
    return String(s || "").trim().toLowerCase().replace(/\s+/g, "-");
  }

  function uniqSorted(arr){
    return Array.from(new Set(arr)).sort((a,b)=>a.localeCompare(b));
  }

  function normalizeRegion(v){
    const x = String(v || "").trim();
    if (!x) return "Unknown";
    if (x.toLowerCase() === "usa") return "USA";
    return x;
  }

  function normalizeFormat(v){
    const x = String(v || "").trim().toLowerCase();
    if (!x) return "unknown";
    return x;
  }

  function topicList(c){
    const t = Array.isArray(c.topic) ? c.topic : (c.topic ? [c.topic] : []);
    return t.map(x => String(x)).filter(Boolean);
  }

  function buildSelect(selectEl, values){
    const current = selectEl.value || "all";
    selectEl.innerHTML = '<option value="all">All</option>';
    for (const v of values){
      const opt = document.createElement("option");
      opt.value = toKey(v);
      opt.textContent = v;
      selectEl.appendChild(opt);
    }
    if ([...selectEl.options].some(o => o.value === current)) selectEl.value = current;
  }

  function shortLocation(c){
    const country = String(c.location_country || "").trim();
    let city = String(c.location_city || "").trim();

    if (!city && country) return country;
    if (!country && city) return city;
    if (!city && !country) return "TBA";

    const parts = city.split(",").map(s => s.trim()).filter(Boolean);
    if (parts.length >= 3){
      city = parts.slice(1).join(", ");
    }

    const cityEndsWithCountry = country && city.toLowerCase().endsWith(country.toLowerCase());
    let loc = cityEndsWithCountry ? city : `${city}, ${country}`;

    if (loc.length > 34){
      const keepCountry = country ? `, ${country}` : "";
      const shortBase = city.slice(0, 22).trimEnd();
      loc = `${shortBase}…${keepCountry}`;
    }
    return loc;
  }

  function conferenceDateRange(c){
    return formatDateRange(c.start_date, c.end_date);
  }

  function conferenceDeadline(c){
    return c.submission_deadline ? formatDate(c.submission_deadline) : "—";
  }

  function computeDeadlineForConference(c){
    const raw = c.submission_deadline;
    if (!raw) return { status: "unknown", daysLeft: null, policy: "none" };

    const policy =
      c.deadline_policy ||
      (raw.includes("T") ? "datetime_fixed" : isDateOnly(raw) ? "date_eod_tz" : "unknown");

    if (policy === "datetime_fixed"){
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return { status: "unknown", daysLeft: null, policy };

      const diffMs = d.getTime() - Date.now();
      const daysLeft = Math.ceil(diffMs / MS_PER_DAY);
      const status =
        diffMs < 0 ? "closed" :
        daysLeft <= SOON_DAYS ? "soon" :
        "open";

      return { status, daysLeft, policy };
    }

    if (policy === "aoe" && isDateOnly(raw)){
      const tz = "Etc/GMT+12"; // UTC-12
      const today = new Date();

      const todayInAoE = new Date(
        new Intl.DateTimeFormat("en-CA", {
          timeZone: tz,
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        }).format(today)
      );

      const deadline = new Date(raw + "T00:00:00");
      const diffDays = Math.floor((deadline - todayInAoE) / MS_PER_DAY);

      const status =
        diffDays < 0 ? "closed" :
        diffDays <= SOON_DAYS ? "soon" :
        "open";

      return { status, daysLeft: diffDays, policy };
    }

    if (isDateOnly(raw)){
      const deadline = new Date(raw + "T23:59:59");
      const diffMs = deadline.getTime() - Date.now();
      const daysLeft = Math.ceil(diffMs / MS_PER_DAY);

      const status =
        diffMs < 0 ? "closed" :
        daysLeft <= SOON_DAYS ? "soon" :
        "open";

      return { status, daysLeft, policy: "date_eod_tz" };
    }

    return { status: "unknown", daysLeft: null, policy: "unknown" };
  }

  function renderCard(c){
    const name = c.name || "Untitled";
    const website = c.website_url || "#";
    const format = normalizeFormat(c.format);
    const deadlineInfo = computeDeadlineForConference(c);

    const chips = [];
    chips.push({ text: shortLocation(c), cls: "chip" });
    chips.push({ text: conferenceDateRange(c), cls: "chip" });

    if (c.submission_deadline){
      const statusLabel =
        deadlineInfo.status === "open" ? "Open" :
        deadlineInfo.status === "soon" ? "Closing soon" :
        deadlineInfo.status === "closed" ? "Closed" :
        "—";

      const text = `Deadline: ${formatDate(c.submission_deadline)} (${statusLabel})`;

      chips.push({
        text,
        cls: `chip chip--deadline chip--${deadlineInfo.status}`
      });
    }

    const chipHtml = chips
      .filter(x => x.text && x.text !== "TBA")
      .map(x => `<span class="${x.cls}">${escapeHtml(x.text)}</span>`)
      .join("");

    const article = document.createElement("article");
    article.className = "card";

    const isOnsite = (format === "onsite");
    article.classList.add(isOnsite ? "card--onsite" : "card--remote");

    article.dataset.title = String(name).toLowerCase();
    article.dataset.region = toKey(normalizeRegion(c.region));
    article.dataset.format = toKey(format);
    article.dataset.topic = topicList(c).map(t => toKey(t)).join("|");
    article.dataset.deadline = c.submission_deadline ? String(c.submission_deadline) : "";

    article.innerHTML = `
      <h2>${escapeHtml(name)}</h2>
      <div class="meta">${chipHtml}</div>
      <a class="cta cta--small" href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer"
         aria-label="Open conference website: ${escapeHtml(name)}">
        Website
      </a>
    `;
    return article;
  }

  function renderRow(c){
    const name = c.name || "Untitled";
    const website = c.website_url || "#";
    const region = normalizeRegion(c.region);
    const format = normalizeFormat(c.format);
    const topics = topicList(c);

    const tr = document.createElement("tr");
    tr.dataset.title = String(name).toLowerCase();
    tr.dataset.region = toKey(region);
    tr.dataset.format = toKey(format);
    tr.dataset.topic = topics.map(t => toKey(t)).join("|");
    tr.dataset.deadline = c.submission_deadline ? String(c.submission_deadline) : "";

    tr.innerHTML = `
      <td class="tname">${escapeHtml(name)}</td>
      <td>${escapeHtml(conferenceDateRange(c))}</td>
      <td>${escapeHtml(shortLocation(c))}</td>
      <td>${escapeHtml(region)}</td>
      <td>${escapeHtml(format)}</td>
      <td>${escapeHtml(topics.join(", ") || "—")}</td>
      <td>${escapeHtml(conferenceDeadline(c))}</td>
      <td class="tlink">
        <a href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer"
           aria-label="Open conference website: ${escapeHtml(name)}">
          Website
        </a>
      </td>
    `;
    return tr;
  }

  function nodesForFiltering(){
    return currentView === "cards"
      ? Array.from(grid.children)
      : Array.from(tbody.children);
  }

  function applyFilters(){
    const qv = q.value.trim().toLowerCase();
    const rv = regionSel.value;
    const tv = topicSel.value;
    const fv = formatSel.value;
    const dv = deadlineSel.value;

    let count = 0;

    for (const node of nodesForFiltering()){
      const title = node.dataset.title || "";
      const r = node.dataset.region || "all";
      const f = node.dataset.format || "all";
      const topics = (node.dataset.topic || "").split("|").filter(Boolean);
      const hasDeadline = (node.dataset.deadline || "") !== "";

      const matchQ = qv === "" || title.includes(qv);
      const matchR = rv === "all" || r === rv;
      const matchF = fv === "all" || f === fv;
      const matchT = tv === "all" || topics.includes(tv);
      const matchD = dv === "all" || (dv === "only" && hasDeadline);

      const ok = matchQ && matchR && matchT && matchF && matchD;

      node.style.display = ok ? "" : "none";
      if (ok) count++;
    }

    statusEl.textContent = `${count} conference${count === 1 ? "" : "s"}`;
  }

  function setView(view){
    currentView = view;
    const isCards = view === "cards";

    viewCardsBtn.setAttribute("aria-pressed", String(isCards));
    viewTableBtn.setAttribute("aria-pressed", String(!isCards));

    grid.hidden = !isCards;
    tableWrap.hidden = isCards;

    applyFilters();

    try { localStorage.setItem("omicentra_view", view); } catch {}
  }

  // ✅ FIXED: sort must be inside conferences.sort((a,b)=>...)
  function sortConferences(){
    const dir = sortDir === "asc" ? 1 : -1;

    function statusRank(info){
      if (info.status === "soon") return 0;
      if (info.status === "open") return 1;
      if (info.status === "closed") return 2;
      return 3;
    }

    function confYear(c){
      const y =
        (c.start_date && /^\d{4}/.test(c.start_date)) ? Number(c.start_date.slice(0,4)) :
        (c.end_date && /^\d{4}/.test(c.end_date)) ? Number(c.end_date.slice(0,4)) :
        Infinity;
      return Number.isFinite(y) ? y : Infinity;
    }

    conferences.sort((a, b) => {
      if (sortKey === "name"){
        const an = String(a.name || "").toLowerCase();
        const bn = String(b.name || "").toLowerCase();
        return an.localeCompare(bn) * dir;
      }

      if (sortKey === "dates"){
        const as = a.start_date ? Date.parse(a.start_date + "T00:00:00") : Infinity;
        const bs = b.start_date ? Date.parse(b.start_date + "T00:00:00") : Infinity;
        return (as - bs) * dir;
      }

      // default: deadline
      const aInfo = computeDeadlineForConference(a);
      const bInfo = computeDeadlineForConference(b);

      const aRank = statusRank(aInfo);
      const bRank = statusRank(bInfo);
      if (aRank !== bRank) return (aRank - bRank) * dir;

      const ay = confYear(a);
      const by = confYear(b);
      if (ay !== by) return (ay - by) * dir;

      const aDays = (aInfo.daysLeft === null) ? Infinity : aInfo.daysLeft;
      const bDays = (bInfo.daysLeft === null) ? Infinity : bInfo.daysLeft;
      if (aDays !== bDays) return (aDays - bDays) * dir;

      const as = a.start_date ? Date.parse(a.start_date + "T00:00:00") : Infinity;
      const bs = b.start_date ? Date.parse(b.start_date + "T00:00:00") : Infinity;
      return (as - bs) * dir;
    });
  }

  function updateAriaSort(){
    const none = "none";
    const asc = "ascending";
    const desc = "descending";

    thName.setAttribute("aria-sort", sortKey === "name" ? (sortDir === "asc" ? asc : desc) : none);
    thDates.setAttribute("aria-sort", sortKey === "dates" ? (sortDir === "asc" ? asc : desc) : none);
    thDeadline.setAttribute("aria-sort", sortKey === "deadline" ? (sortDir === "asc" ? asc : desc) : none);
  }

  function rerender(){
    grid.innerHTML = "";
    tbody.innerHTML = "";
    for (const c of conferences){
      grid.appendChild(renderCard(c));
      tbody.appendChild(renderRow(c));
    }
    updateAriaSort();
    applyFilters();
  }

  function setSort(key){
    if (sortKey === key){
      sortDir = (sortDir === "asc") ? "desc" : "asc";
    } else {
      sortKey = key;
      sortDir = "asc";
    }
    sortConferences();
    rerender();
  }

  function attachSortHandlers(){
    const buttons = Array.from(document.querySelectorAll(".thbtn[data-sort]"));
    for (const b of buttons){
      b.addEventListener("click", () => {
        const key = b.getAttribute("data-sort");
        if (key === "name" || key === "dates" || key === "deadline") setSort(key);
      });
    }
  }

  async function loadData(){
    statusEl.textContent = "Loading…";

    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load ${DATA_URL} (${res.status})`);

    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Invalid JSON: expected an array");

    conferences = data.filter(c => !isPastOrOngoing(c));

    const regions = uniqSorted(conferences.map(c => normalizeRegion(c.region)).filter(Boolean));
    const formats = uniqSorted(conferences.map(c => normalizeFormat(c.format)).filter(Boolean));
    const topics = uniqSorted(conferences.flatMap(c => topicList(c)).filter(Boolean));

    buildSelect(regionSel, regions);
    buildSelect(topicSel, topics);

    formatSel.innerHTML = '<option value="all">All</option>';
    for (const f of formats){
      const opt = document.createElement("option");
      opt.value = toKey(f);
      opt.textContent = f;
      formatSel.appendChild(opt);
    }

    sortKey = "deadline";
    sortDir = "asc";
    sortConferences();
    rerender();

    let saved = "cards";
    try { saved = localStorage.getItem("omicentra_view") || "cards"; } catch {}
    setView(saved === "table" ? "table" : "cards");

    attachSortHandlers();
  }

  const applyFiltersDebounced = debounce(applyFilters, SEARCH_DEBOUNCE_MS);

  q.addEventListener("input", applyFiltersDebounced);
  regionSel.addEventListener("change", applyFilters);
  topicSel.addEventListener("change", applyFilters);
  formatSel.addEventListener("change", applyFilters);
  deadlineSel.addEventListener("change", applyFilters);

  resetBtn.addEventListener("click", () => {
    q.value = "";
    regionSel.value = "all";
    topicSel.value = "all";
    formatSel.value = "all";
    deadlineSel.value = "all";
    applyFilters();
    q.focus();
  });

  viewCardsBtn.addEventListener("click", () => setView("cards"));
  viewTableBtn.addEventListener("click", () => setView("table"));

  loadData().catch(err => {
    console.error(err);
    statusEl.textContent = `Failed to load conferences: ${err.message || err}`;
    grid.innerHTML = "";
    tbody.innerHTML = "";
  });
})();
