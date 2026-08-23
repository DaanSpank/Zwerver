# Aandelen Gezondheidschecker

Een statische webapp die per aandeel een aantal fundamentele parameters
beoordeelt op groen (gezond), geel (let op) of rood (risico), met per
parameter de onderliggende cijfers en de bron.

## Hoe het werkt

Dit project draait volledig op **GitHub Pages** (puur statisch, geen
backend, geen API-key nodig in de browser):

1. Een **GitHub Action** (`.github/workflows/update-data.yml`) draait
   dagelijks en voert `scripts/fetch_data.py` uit. Dat script haalt voor
   elke ticker in `tickers.json` gegevens op bij meerdere bronnen (Yahoo
   Finance, Finviz, StockAnalysis.com, best-effort Investing.com),
   combineert ze en berekent per parameter groen/geel/rood.
2. Het resultaat wordt weggeschreven naar `data/stocks.json` en
   automatisch gecommit door de Action.
3. `index.html` / `app.js` / `style.css` lezen alleen dat JSON-bestand uit
   en tonen het als een grid van selecteerbare aandeelkaarten met een
   detailpaneel per aandeel.

Zo blijft de site 100% statisch (geschikt voor GitHub Pages) terwijl de
data toch uit meerdere bronnen wordt samengesteld — het scrapen gebeurt
server-side in de Action, waar CORS geen rol speelt.

## Aandelen toevoegen/verwijderen

Er zijn drie manieren:

1. **Rechtstreeks in de app (aanbevolen)**: eenmalig instellen via
   **⚙ Instellingen** — zie [`cloudflare-worker/README.md`](./cloudflare-worker/README.md)
   voor de setup van de gratis Cloudflare Worker die dit mogelijk maakt.
   Daarna werken **+ Toevoegen** en **Verwijderen uit watchlist** direct,
   inclusief het automatisch starten van de data-update.
2. **Via de site zonder instellingen**: **+ Toevoegen**/**Verwijderen**
   kopiëren de juiste tekst naar het klembord en openen de GitHub-
   editpagina van `tickers.json` — plakken en committen doe je dan zelf.
3. **Via de chat**: vraag het gewoon (bv. "voeg SAP.DE toe" / "haal TSLA
   weg") — dan bewerk en push ik `tickers.json` direct.

> **Waarom niet gewoon een eigen GitHub-token rechtstreeks in de
> browser?** Dat is getest en werkt niet: GitHub's Contents API
> ondersteunt geen CORS-preflight voor schrijfacties (PUT), dus de browser
> blokkeert zo'n aanroep altijd, ongeacht het token. Een token dat je al
> hebt aangemaakt (met "Contents: read/write" + optioneel "Actions:
> read/write", scope beperkt tot deze repo) kun je gewoon hergebruiken —
> plak 'm als `GITHUB_TOKEN`-secret in de Worker (stap 3 van de setup)
> in plaats van in de browser.

Na een wijziging neemt de volgende dagelijkse Action-run (of een
handmatige trigger via **Actions → Update stock data → Run workflow**) de
nieuwe watchlist mee.

Om nieuwe tickers te vínden staat er een doorzoekbare referentielijst van
~280 bekende Amerikaanse en Europese large-cap aandelen
(`data/ticker-universe.json`), los van je watchlist. Dit zijn geen live
cijfers en de lijst is samengesteld uit trainingskennis (niet uit een live
bron), dus controleer een ticker voordat je erop vertrouwt; zie het
`note`-veld in dat bestand.

## Parameters

| Parameter | Groen | Geel | Rood |
|---|---|---|---|
| Koers/Winst-verhouding | ≤ 20 | 20–35 | > 35 of negatief |
| Schuld / Eigen vermogen | < 0,5 | 0,5–1,5 | > 1,5 |
| Return on Equity | ≥ 15% | 5–15% | < 5% |
| Omzetgroei (YoY) | ≥ 8% | 0–8% | < 0% |
| Free Cash Flow | positief | 0 | negatief |
| Dividend uitkeringsratio | ≤ 60% | 60–90% | > 90% (n.v.t. bij geen dividend) |

Drempelwaarden staan in `scripts/metrics.py` en zijn eenvoudig aan te
passen.

## Lokaal testen

```bash
python3 -m http.server 8000
# open http://localhost:8000  (niet via file://, dat blokkeert de fetch van data/stocks.json)
```

Scraper handmatig draaien (buiten deze sandbox — vereist normale
internettoegang):

```bash
pip install -r scripts/requirements.txt
python3 scripts/fetch_data.py
```

## Bekende beperkingen

- **Investing.com** heeft agressieve bot-bescherming; die bron levert in
  de praktijk vaak niets op en dient puur als best-effort aanvulling.
- Scraping van HTML-pagina's (Finviz, StockAnalysis.com) is gevoelig voor
  layoutwijzigingen op die sites — als een bron structureel niets meer
  oplevert, valt de volgende bron in de keten automatisch in.
- Data wordt maximaal dagelijks ververst, niet real-time.
