"""
Per-bron fetchers. Elke fetcher probeert zoveel mogelijk van de volgende
genormaliseerde velden te vullen en geeft er zo min mogelijk info naast:

    name, pe_ratio, debt_to_equity, roe, revenue_growth,
    free_cash_flow, dividend_payout

Een fetcher die faalt (site onbereikbaar, layout veranderd, block door
bot-bescherming) geeft gewoon een lege dict terug — de aanroeper valt dan
terug op de volgende bron in de prioriteitsketen.
"""

import re
import requests
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    )
}
TIMEOUT = 12


def _to_float(text):
    if text is None:
        return None
    text = text.strip().replace(",", "")
    if text in ("", "-", "N/A", "NaN", "--"):
        return None
    negative = text.startswith("(") and text.endswith(")")
    text = text.strip("()")
    is_pct = text.endswith("%")
    text = text.rstrip("%")
    multiplier = 1
    suffix = text[-1:].upper()
    if suffix in ("K", "M", "B", "T"):
        multiplier = {"K": 1e3, "M": 1e6, "B": 1e9, "T": 1e12}[suffix]
        text = text[:-1]
    try:
        value = float(text) * multiplier
    except ValueError:
        return None
    if is_pct:
        value = value / 100.0
    if negative:
        value = -value
    return value


def _label_value_map(soup):
    """Verzamel alle (label, waarde)-paren uit tabellen op de pagina."""
    mapping = {}
    for row in soup.find_all("tr"):
        cells = row.find_all(["td", "th"])
        texts = [c.get_text(strip=True) for c in cells]
        # Verwerk cellen als afwisselende label/waarde-paren (finviz-stijl)
        # en als klassieke 2-koloms rijen (stockanalysis/investing-stijl).
        if len(texts) >= 2 and len(texts) % 2 == 0:
            for i in range(0, len(texts), 2):
                label = texts[i].lower()
                mapping.setdefault(label, texts[i + 1])
        elif len(texts) == 2:
            mapping.setdefault(texts[0].lower(), texts[1])
    return mapping


def _find(mapping, *needles):
    for key, value in mapping.items():
        for needle in needles:
            if needle in key:
                return value
    return None


def fetch_yahoo(ticker):
    try:
        import yfinance as yf

        info = yf.Ticker(ticker).get_info()
    except Exception:
        return {}

    if not info:
        return {}

    return {
        "name": info.get("longName") or info.get("shortName"),
        "pe_ratio": info.get("trailingPE"),
        "debt_to_equity": (
            info["debtToEquity"] / 100.0 if info.get("debtToEquity") is not None else None
        ),
        "roe": info.get("returnOnEquity"),
        "revenue_growth": info.get("revenueGrowth"),
        "free_cash_flow": info.get("freeCashflow"),
        "dividend_payout": info.get("payoutRatio"),
    }


def fetch_finviz(ticker):
    try:
        resp = requests.get(
            f"https://finviz.com/quote.ashx?t={ticker}",
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")
        mapping = _label_value_map(soup)
        name_tag = soup.find("h2") or soup.find(class_="quote-header_ticker-wrapper_company")
    except Exception:
        return {}

    return {
        "name": name_tag.get_text(strip=True) if name_tag else None,
        "pe_ratio": _to_float(_find(mapping, "p/e")),
        "debt_to_equity": _to_float(_find(mapping, "debt/eq")),
        "roe": _to_float(_find(mapping, "roe")),
        "revenue_growth": _to_float(_find(mapping, "sales q/q", "sales growth")),
        "free_cash_flow": None,  # finviz toont geen absolute FCF
        "dividend_payout": _to_float(_find(mapping, "payout")),
    }


def fetch_stockanalysis(ticker):
    try:
        resp = requests.get(
            f"https://stockanalysis.com/stocks/{ticker}/statistics/",
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")
        mapping = _label_value_map(soup)
    except Exception:
        return {}

    return {
        "name": None,
        "pe_ratio": _to_float(_find(mapping, "pe ratio")),
        "debt_to_equity": _to_float(_find(mapping, "debt / equity")),
        "roe": _to_float(_find(mapping, "return on equity")),
        "revenue_growth": _to_float(_find(mapping, "revenue growth")),
        "free_cash_flow": _to_float(_find(mapping, "free cash flow")),
        "dividend_payout": _to_float(_find(mapping, "payout ratio")),
    }


def fetch_investing(ticker):
    """
    Best-effort: investing.com staat achter agressieve bot-bescherming en
    faalt in de praktijk vaak (403 / uitdagingspagina). We proberen het
    zonder speciale omzeiling — als het faalt, leveren we simpelweg niets.
    """
    try:
        resp = requests.get(
            "https://www.investing.com/search/?q=" + ticker,
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        if resp.status_code != 200:
            return {}
        # Zonder een betrouwbare, directe quote-URL per ticker houden we dit
        # bewust minimaal: alleen bruikbaar als aanvullende, best-effort bron.
        return {}
    except Exception:
        return {}


# Prioriteitsvolgorde: eerste bron die een veld levert "wint".
SOURCES = [
    ("Yahoo Finance", fetch_yahoo),
    ("Finviz", fetch_finviz),
    ("StockAnalysis.com", fetch_stockanalysis),
    ("Investing.com", fetch_investing),
]
