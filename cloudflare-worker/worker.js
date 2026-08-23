/**
 * Watchlist-schrijfservice voor de Aandelen Gezondheidschecker.
 *
 * De site zelf blijft puur statisch (GitHub Pages). Deze Worker is het
 * enige onderdeel dat een GitHub-token vasthoudt (als secret, nooit
 * zichtbaar in de browser) en voert namens de app twee dingen uit:
 *   1. ticker toevoegen/verwijderen in tickers.json (via de GitHub API)
 *   2. de "Update stock data"-Action direct triggeren, zodat de nieuwe
 *      ticker snel echte cijfers krijgt i.p.v. te wachten op de nachtelijke run
 *
 * Vereiste secrets (Cloudflare dashboard → Workers & Pages → deze Worker
 * → Settings → Variables and Secrets):
 *   GITHUB_TOKEN   fine-grained PAT, alleen scope op DaanSpank/Zwerver,
 *                  permissions: Contents (read/write) + Actions (read/write)
 *   SHARED_SECRET  een zelfgekozen wachtwoord; alleen wie dit weet (jij, in
 *                  de site-instellingen) kan tickers toevoegen/verwijderen
 */

const OWNER = "DaanSpank";
const REPO = "Zwerver";
const TICKERS_PATH = "tickers.json";
const BRANCH = "main";

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== "POST") {
      return jsonResponse({ error: "Alleen POST toegestaan" }, 405, cors);
    }
    if (request.headers.get("Authorization") !== `Bearer ${env.SHARED_SECRET}`) {
      return jsonResponse({ error: "Ongeldige toegangscode" }, 401, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "Ongeldige JSON" }, 400, cors);
    }

    const { action, ticker } = body || {};
    if (action !== "add" && action !== "remove") {
      return jsonResponse({ error: "action moet 'add' of 'remove' zijn" }, 400, cors);
    }

    const clean = String(ticker || "").trim().toUpperCase();
    if (!/^[A-Z0-9.\-]{1,15}$/.test(clean)) {
      return jsonResponse({ error: "Ongeldig ticker-formaat" }, 400, cors);
    }

    const ghHeaders = {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "zwerver-watchlist-worker",
      Accept: "application/vnd.github+json",
    };
    const contentsUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${TICKERS_PATH}`;

    const getRes = await fetch(`${contentsUrl}?ref=${BRANCH}`, { headers: ghHeaders });
    if (!getRes.ok) {
      return jsonResponse({ error: "Kon tickers.json niet lezen van GitHub" }, 502, cors);
    }
    const file = await getRes.json();
    const current = JSON.parse(base64ToUtf8(file.content));
    const list = Array.isArray(current.tickers) ? current.tickers : [];

    let newList = list;
    let changed = false;
    if (action === "add" && !list.includes(clean)) {
      newList = [...list, clean];
      changed = true;
    } else if (action === "remove" && list.includes(clean)) {
      newList = list.filter((t) => t !== clean);
      changed = true;
    }

    if (!changed) {
      return jsonResponse({ ok: true, changed: false, tickers: list }, 200, cors);
    }

    current.tickers = newList;
    const putRes = await fetch(contentsUrl, {
      method: "PUT",
      headers: { ...ghHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        message:
          action === "add"
            ? `Voeg ${clean} toe aan watchlist (via app)`
            : `Verwijder ${clean} uit watchlist (via app)`,
        content: utf8ToBase64(JSON.stringify(current, null, 2) + "\n"),
        sha: file.sha,
        branch: BRANCH,
      }),
    });

    if (!putRes.ok) {
      const detail = await putRes.text();
      return jsonResponse({ error: "Kon tickers.json niet opslaan", detail }, 502, cors);
    }

    // Best-effort: direct de data-refresh starten. Mag falen (bv. token
    // zonder Actions-permissie) zonder de hele aanvraag te laten mislukken.
    try {
      await fetch(
        `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/update-data.yml/dispatches`,
        {
          method: "POST",
          headers: { ...ghHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ ref: BRANCH }),
        }
      );
    } catch {
      // negeren
    }

    return jsonResponse({ ok: true, changed: true, tickers: newList }, 200, cors);
  },
};

function jsonResponse(obj, status, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

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
