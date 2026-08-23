# Watchlist-schrijfservice (Cloudflare Worker)

Deze kleine, gratis Cloudflare Worker laat de site zelf tickers
toevoegen/verwijderen uit `tickers.json`, zonder dat er ooit een
GitHub-token in de browser komt. Eenmalig instellen via het Cloudflare-
dashboard (geen command line nodig):

## 1. Worker aanmaken

1. Ga naar [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Create Worker**.
2. Geef 'm een naam, bv. `zwerver-watchlist`. Klik **Deploy** (met de standaard "Hello World"-code, die vervangen we zo).
3. Klik op de nieuwe Worker → **Edit code**. Vervang alle code door de inhoud van [`worker.js`](./worker.js) uit deze map. Klik **Deploy**.

## 2. GitHub-token aanmaken (alleen voor deze ene repo)

1. Ga naar GitHub → **Settings** (je account) → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. **Repository access**: kies "Only select repositories" → `DaanSpank/Zwerver`.
3. **Permissions**: zet **Contents** op *Read and write*, en **Actions** op *Read and write* (dat laatste is optioneel — daarmee start een toevoeging/verwijdering meteen de data-update, anders wacht je tot de volgende nachtelijke run).
4. Genereer en kopieer de token (je ziet 'm maar één keer).

## 3. Secrets instellen op de Worker

Ga naar je Worker → **Settings** → **Variables and Secrets** → **Add**:

| Naam | Type | Waarde |
|---|---|---|
| `GITHUB_TOKEN` | Secret | de token uit stap 2 |
| `SHARED_SECRET` | Secret | een zelfbedacht wachtwoord (bv. een lange willekeurige tekst) |

Klik **Deploy** om de secrets actief te maken.

## 4. Worker-URL koppelen aan de site

Je Worker heeft nu een URL als `https://zwerver-watchlist.<jouw-subdomein>.workers.dev`.
Open de site, klik op **⚙ Instellingen** (naast de tabs) en vul in:
- **Worker-URL**: de URL hierboven
- **Toegangscode**: hetzelfde wachtwoord als `SHARED_SECRET`

Dat wordt lokaal in je browser onthouden (localStorage). Vanaf nu werken
**+ Toevoegen** en **Verwijderen uit watchlist** direct, zonder naar GitHub
te hoeven.

## Waarom dit veilig is

- Het GitHub-token staat alléén in de Worker (server-side secret), nooit in
  de browser of in de site-code.
- De Worker accepteert alleen aanvragen met de juiste `SHARED_SECRET` — wie
  dat wachtwoord niet kent, kan niets wijzigen.
- Het token is fijnmazig gescoped op deze ene repo, dus zelfs bij misbruik
  is de schade beperkt tot dit project.
