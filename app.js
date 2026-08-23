const STATUS_META = {
  green: { icon: "✓", label: "Gezond", className: "status-good" },
  yellow: { icon: "!", label: "Let op", className: "status-warning" },
  red: { icon: "✕", label: "Risico", className: "status-critical" },
  na: { icon: "–", label: "N.v.t.", className: "status-na" },
};

const grid = document.getElementById("grid");
const emptyState = document.getElementById("empty-state");
const searchInput = document.getElementById("search");
const updatedEl = document.getElementById("updated");

const overlay = document.getElementById("detail-overlay");
const detailTitle = document.getElementById("detail-title");
const detailOverall = document.getElementById("detail-overall");
const detailMetrics = document.getElementById("detail-metrics");
const detailSourceNote = document.getElementById("detail-source-note");
const detailClose = document.getElementById("detail-close");

let stocks = [];
let universe = [];

const tabWatchlist = document.getElementById("tab-watchlist");
const tabExplore = document.getElementById("tab-explore");
const panelWatchlist = document.getElementById("panel-watchlist");
const panelExplore = document.getElementById("panel-explore");
const exploreBody = document.getElementById("explore-body");
const exploreEmptyState = document.getElementById("explore-empty-state");
const exploreNote = document.getElementById("explore-note");

function formatValue(metric) {
  if (metric.value === null || metric.value === undefined) {
    return "Onbekend";
  }
  const v = metric.value;
  if (metric.unit === "%") {
    return `${(v * 100).toFixed(1)}%`;
  }
  if (metric.unit === "$") {
    const abs = Math.abs(v);
    const sign = v < 0 ? "-" : "";
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
    return `${sign}$${abs.toFixed(0)}`;
  }
  return `${v.toFixed(2)}${metric.unit}`;
}

function renderCard(stock) {
  const card = document.createElement("button");
  card.className = "stock-card";
  card.type = "button";
  card.setAttribute("aria-haspopup", "dialog");

  const overall = STATUS_META[stock.overall_color] || STATUS_META.na;

  const top = document.createElement("div");
  top.className = "stock-card-top";
  top.innerHTML = `
    <div>
      <div class="stock-ticker">${stock.ticker}</div>
      <div class="stock-name">${stock.name}</div>
    </div>
    <span class="status-pill ${overall.className}">
      <span class="icon">${overall.icon}</span>${overall.label}
    </span>
  `;

  const metricRow = document.createElement("div");
  metricRow.className = "metric-row";
  stock.metrics.forEach((metric) => {
    const meta = STATUS_META[metric.color] || STATUS_META.na;
    const chip = document.createElement("span");
    chip.className = `metric-chip ${meta.className}`;
    chip.textContent = meta.icon;
    chip.title = `${metric.label}: ${meta.label} (${formatValue(metric)})`;
    chip.setAttribute(
      "aria-label",
      `${metric.label}: ${meta.label}, waarde ${formatValue(metric)}`
    );
    metricRow.appendChild(chip);
  });

  card.appendChild(top);
  card.appendChild(metricRow);
  card.addEventListener("click", () => openDetail(stock));
  return card;
}

function openDetail(stock) {
  const overall = STATUS_META[stock.overall_color] || STATUS_META.na;
  detailTitle.textContent = `${stock.ticker} — ${stock.name}`;
  detailOverall.innerHTML = `Algehele status: <strong class="${overall.className}">${overall.icon} ${overall.label}</strong>`;

  detailMetrics.innerHTML = "";
  stock.metrics.forEach((metric) => {
    const meta = STATUS_META[metric.color] || STATUS_META.na;
    const li = document.createElement("li");
    li.className = "detail-metric";
    li.innerHTML = `
      <span class="metric-chip ${meta.className}" aria-hidden="true">${meta.icon}</span>
      <div class="detail-metric-body">
        <div class="detail-metric-label">
          ${metric.label} <span class="${meta.className}">(${meta.label})</span>
        </div>
        <div class="detail-metric-value">${formatValue(metric)}</div>
        <p class="detail-metric-explanation">${metric.explanation}</p>
        ${
          metric.source
            ? `<div class="detail-metric-source">Bron: ${metric.source}</div>`
            : ""
        }
      </div>
    `;
    detailMetrics.appendChild(li);
  });

  overlay.hidden = false;
  detailClose.focus();
}

function closeDetail() {
  overlay.hidden = true;
}

detailClose.addEventListener("click", closeDetail);
overlay.addEventListener("click", (e) => {
  if (e.target === overlay) closeDetail();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !overlay.hidden) closeDetail();
});

function renderGrid(filter) {
  const term = (filter || "").trim().toLowerCase();
  const filtered = stocks.filter(
    (s) =>
      !term ||
      s.ticker.toLowerCase().includes(term) ||
      s.name.toLowerCase().includes(term)
  );

  grid.innerHTML = "";
  filtered.forEach((stock) => grid.appendChild(renderCard(stock)));
  emptyState.hidden = filtered.length !== 0;
}

let activeTab = "watchlist";

function renderExplore(filter) {
  const term = (filter || "").trim().toLowerCase();
  const filtered = universe.filter(
    (t) =>
      !term ||
      t.ticker.toLowerCase().includes(term) ||
      t.name.toLowerCase().includes(term) ||
      (t.exchange || "").toLowerCase().includes(term)
  );

  exploreBody.innerHTML = "";
  filtered.forEach((t) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${t.ticker}</strong></td>
      <td>${t.name}</td>
      <td>${t.exchange || "VS (NYSE/Nasdaq)"}</td>
      <td><button type="button" class="copy-btn" data-ticker="${t.ticker}">Kopieer</button></td>
    `;
    exploreBody.appendChild(tr);
  });
  exploreEmptyState.hidden = filtered.length !== 0;
}

exploreBody.addEventListener("click", (e) => {
  const btn = e.target.closest(".copy-btn");
  if (!btn) return;
  navigator.clipboard?.writeText(btn.dataset.ticker).then(() => {
    const original = btn.textContent;
    btn.textContent = "Gekopieerd!";
    setTimeout(() => (btn.textContent = original), 1200);
  });
});

function setActiveTab(tab) {
  activeTab = tab;
  const onWatchlist = tab === "watchlist";

  tabWatchlist.classList.toggle("is-active", onWatchlist);
  tabWatchlist.setAttribute("aria-selected", String(onWatchlist));
  tabExplore.classList.toggle("is-active", !onWatchlist);
  tabExplore.setAttribute("aria-selected", String(!onWatchlist));

  panelWatchlist.hidden = !onWatchlist;
  panelExplore.hidden = onWatchlist;

  searchInput.placeholder = onWatchlist
    ? "Zoek op ticker of naam…"
    : "Zoek nieuwe ticker op naam, symbool of beurs…";
  searchInput.value = "";
  onWatchlist ? renderGrid("") : renderExplore("");
}

tabWatchlist.addEventListener("click", () => setActiveTab("watchlist"));
tabExplore.addEventListener("click", () => setActiveTab("explore"));

searchInput.addEventListener("input", () => {
  activeTab === "watchlist"
    ? renderGrid(searchInput.value)
    : renderExplore(searchInput.value);
});

async function init() {
  try {
    const res = await fetch("data/stocks.json", { cache: "no-store" });
    const data = await res.json();
    stocks = data.stocks || [];
    renderGrid("");

    const generated = new Date(data.generated_at);
    const note = data.note ? ` — ${data.note}` : "";
    updatedEl.textContent = `Laatst bijgewerkt: ${generated.toLocaleString(
      "nl-NL"
    )}${note}`;
  } catch (err) {
    emptyState.hidden = false;
    emptyState.textContent =
      "Kon data/stocks.json niet laden. Draai dit via een lokale server of GitHub Pages (niet via file://).";
    console.error(err);
  }

  try {
    const res = await fetch("data/ticker-universe.json", { cache: "no-store" });
    const data = await res.json();
    universe = [
      ...(data.us || []),
      ...(data.europe || []),
    ].sort((a, b) => a.ticker.localeCompare(b.ticker));
    exploreNote.textContent = data.note || "";
  } catch (err) {
    exploreNote.textContent = "Kon de tickerlijst niet laden.";
    console.error(err);
  }
}

init();
