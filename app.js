const TICKERS_JSON_EDIT_URL =
  "https://github.com/DaanSpank/Zwerver/edit/main/tickers.json";

function copyText(text) {
  return navigator.clipboard?.writeText(text);
}

function flashButton(btn, message) {
  const original = btn.textContent;
  btn.textContent = message;
  setTimeout(() => (btn.textContent = original), 1400);
}

const statusMsg = document.getElementById("status-msg");
let statusTimer = null;

function showStatus(message, isError) {
  statusMsg.textContent = message;
  statusMsg.classList.toggle("is-error", Boolean(isError));
  statusMsg.hidden = false;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (statusMsg.hidden = true), 8000);
}

const GITHUB_OWNER = "DaanSpank";
const GITHUB_REPO = "Zwerver";
const TICKERS_PATH = "tickers.json";

function getGithubToken() {
  return localStorage.getItem("githubToken") || "";
}

const settingsBtn = document.getElementById("settings-btn");
settingsBtn.addEventListener("click", () => {
  const token = window.prompt(
    "GitHub personal access token (fine-grained, alleen scope op DaanSpank/Zwerver, " +
      "permissions Contents: read/write — optioneel ook Actions: read/write voor " +
      "meteen verversen). Leeg laten om uit te zetten:",
    getGithubToken()
  );
  if (token === null) return;
  localStorage.setItem("githubToken", token.trim());
  showStatus(
    token.trim()
      ? "Token opgeslagen (alleen in jouw browser) — toevoegen/verwijderen werkt nu direct."
      : "Token verwijderd — knoppen vallen terug op kopiëren + GitHub."
  );
});

function base64ToUtf8(b64) {
  const binary = atob(b64.replace(/\n/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * Werkt tickers.json rechtstreeks bij via de GitHub API, met het token dat
 * de gebruiker zelf in ⚙ Instellingen heeft opgeslagen (alleen lokaal in
 * hun browser). Geeft true terug bij succes, false als er geen token is
 * ingesteld of de aanroep faalt (aanroeper valt dan terug op de
 * kopieer+GitHub-flow).
 */
async function callGithubApi(action, ticker) {
  const token = getGithubToken();
  if (!token) return false;

  const ghHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
  };
  const contentsUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${TICKERS_PATH}`;

  try {
    const getRes = await fetch(`${contentsUrl}?ref=main`, { headers: ghHeaders });
    if (!getRes.ok) {
      showStatus(`Kon tickers.json niet lezen (${getRes.status}).`, true);
      return false;
    }
    const file = await getRes.json();
    const current = JSON.parse(base64ToUtf8(file.content));
    const list = Array.isArray(current.tickers) ? current.tickers : [];

    let newList = list;
    let changed = false;
    if (action === "add" && !list.includes(ticker)) {
      newList = [...list, ticker];
      changed = true;
    } else if (action === "remove" && list.includes(ticker)) {
      newList = list.filter((t) => t !== ticker);
      changed = true;
    }
    if (!changed) return true;

    current.tickers = newList;
    const putRes = await fetch(contentsUrl, {
      method: "PUT",
      headers: { ...ghHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        message:
          action === "add"
            ? `Voeg ${ticker} toe aan watchlist (via app)`
            : `Verwijder ${ticker} uit watchlist (via app)`,
        content: utf8ToBase64(JSON.stringify(current, null, 2) + "\n"),
        sha: file.sha,
        branch: "main",
      }),
    });
    if (!putRes.ok) {
      const detail = await putRes.json().catch(() => ({}));
      showStatus(`Kon niet opslaan: ${detail.message || putRes.statusText}`, true);
      return false;
    }

    // Best-effort: direct de data-refresh starten (vereist Actions-permissie
    // op het token). Mag falen zonder de toevoeging/verwijdering ongedaan
    // te maken — dan wacht het gewoon tot de nachtelijke run.
    fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/update-data.yml/dispatches`,
      {
        method: "POST",
        headers: { ...ghHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ ref: "main" }),
      }
    ).catch(() => {});

    return true;
  } catch (err) {
    showStatus("Kon GitHub niet bereiken.", true);
    console.error(err);
    return false;
  }
}

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
const pendingAdded = new Set();

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
  const card = document.createElement("div");
  card.className = "stock-card";
  card.setAttribute("role", "button");
  card.setAttribute("tabindex", "0");
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

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "remove-btn";
  removeBtn.title = `${stock.ticker} verwijderen uit watchlist`;
  removeBtn.setAttribute("aria-label", `${stock.ticker} verwijderen uit watchlist`);
  removeBtn.textContent = "Verwijderen uit watchlist";
  removeBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    removeBtn.disabled = true;
    const worked = await callGithubApi("remove", stock.ticker);
    removeBtn.disabled = false;

    if (worked) {
      stocks = stocks.filter((s) => s.ticker !== stock.ticker);
      renderGrid(searchInput.value);
      showStatus(
        `${stock.ticker} verwijderd. De site ververst zichzelf over ~1-2 minuten met de nieuwe watchlist.`
      );
      return;
    }

    copyText(`Verwijder de regel "${stock.ticker}", uit tickers.json`);
    window.open(TICKERS_JSON_EDIT_URL, "_blank", "noopener");
    flashButton(removeBtn, "Instructie gekopieerd, GitHub geopend…");
  });

  card.appendChild(top);
  card.appendChild(metricRow);
  card.appendChild(removeBtn);
  card.addEventListener("click", () => openDetail(stock));
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openDetail(stock);
    }
  });
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
    const alreadyTracked =
      stocks.some((s) => s.ticker === t.ticker) || pendingAdded.has(t.ticker);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${t.ticker}</strong></td>
      <td>${t.name}</td>
      <td>${t.exchange || "VS (NYSE/Nasdaq)"}</td>
      <td class="explore-actions">
        <button type="button" class="copy-btn" data-ticker="${t.ticker}">Kopieer</button>
        ${
          alreadyTracked
            ? `<span class="already-tracked">Al in watchlist</span>`
            : `<button type="button" class="add-btn" data-ticker="${t.ticker}">+ Toevoegen</button>`
        }
      </td>
    `;
    exploreBody.appendChild(tr);
  });
  exploreEmptyState.hidden = filtered.length !== 0;
}

exploreBody.addEventListener("click", async (e) => {
  const copyBtn = e.target.closest(".copy-btn");
  if (copyBtn) {
    copyText(copyBtn.dataset.ticker);
    flashButton(copyBtn, "Gekopieerd!");
    return;
  }

  const addBtn = e.target.closest(".add-btn");
  if (addBtn) {
    const ticker = addBtn.dataset.ticker;
    addBtn.disabled = true;
    const worked = await callGithubApi("add", ticker);
    addBtn.disabled = false;

    if (worked) {
      pendingAdded.add(ticker);
      showStatus(
        `${ticker} toegevoegd. De cijfers verschijnen over ~1-2 minuten, ververs de pagina dan.`
      );
      renderExplore(searchInput.value);
      return;
    }

    copyText(`"${ticker}",`);
    window.open(TICKERS_JSON_EDIT_URL, "_blank", "noopener");
    flashButton(addBtn, "Gekopieerd, GitHub geopend…");
  }
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
