#!/usr/bin/env python3
"""
Haalt voor elke ticker in tickers.json fundamentele gegevens op bij
meerdere bronnen, combineert ze (eerste bron die een waarde levert wint),
berekent een groen/geel/rood-oordeel per parameter en schrijft alles weg
naar data/stocks.json. Wordt aangeroepen door de GitHub Action, maar kan
ook lokaal draaien: `python scripts/fetch_data.py`.
"""

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from metrics import METRICS, overall_color  # noqa: E402
from sources import SOURCES  # noqa: E402

ROOT = Path(__file__).parent.parent
TICKERS_FILE = ROOT / "tickers.json"
OUTPUT_FILE = ROOT / "data" / "stocks.json"

FIELD_TO_METRIC = {
    "pe_ratio": "pe_ratio",
    "debt_to_equity": "debt_to_equity",
    "roe": "roe",
    "revenue_growth": "revenue_growth",
    "free_cash_flow": "free_cash_flow",
    "dividend_payout": "dividend_payout",
}


def gather_ticker_data(ticker):
    merged = {}
    source_of = {}
    name = None

    for source_name, fetch_fn in SOURCES:
        try:
            data = fetch_fn(ticker)
        except Exception as exc:  # nooit de hele run laten crashen op 1 bron
            print(f"  [WARN] {source_name} faalde voor {ticker}: {exc}")
            data = {}

        if not name and data.get("name"):
            name = data["name"]

        for field in FIELD_TO_METRIC:
            if field not in merged and data.get(field) is not None:
                merged[field] = data[field]
                source_of[field] = source_name

        time.sleep(0.5)  # wees aardig voor de bronnen

    return name, merged, source_of


def build_metric_entries(merged, source_of):
    entries = []
    colors = []
    for metric in METRICS:
        raw_value = merged.get(metric["id"])
        color = metric["score_fn"](raw_value)
        colors.append(color)
        entries.append(
            {
                "id": metric["id"],
                "label": metric["label"],
                "value": raw_value,
                "unit": metric["unit"],
                "color": color,
                "source": source_of.get(metric["id"]),
                "explanation": metric["explanation"],
            }
        )
    return entries, colors


def main():
    tickers = json.loads(TICKERS_FILE.read_text())["tickers"]
    results = []

    for ticker in tickers:
        print(f"Ophalen: {ticker}")
        name, merged, source_of = gather_ticker_data(ticker)
        entries, colors = build_metric_entries(merged, source_of)
        results.append(
            {
                "ticker": ticker,
                "name": name or ticker,
                "overall_color": overall_color(colors),
                "metrics": entries,
            }
        )

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "stocks": results,
    }

    OUTPUT_FILE.parent.mkdir(exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(output, indent=2, ensure_ascii=False))
    print(f"Weggeschreven naar {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
