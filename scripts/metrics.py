"""
Definities van de gezondheidsparameters: hoe we een ruwe waarde
omzetten naar groen/geel/rood.

Elke metric-functie krijgt de ruwe waarde (float of None) en geeft
'green', 'yellow', 'red' of 'na' (niet van toepassing / onbekend) terug.
"""

def score_pe_ratio(value):
    if value is None or value <= 0:
        return "red" if value is not None else "na"
    if value <= 20:
        return "green"
    if value <= 35:
        return "yellow"
    return "red"


def score_debt_to_equity(value):
    if value is None:
        return "na"
    if value < 0.5:
        return "green"
    if value <= 1.5:
        return "yellow"
    return "red"


def score_roe(value):
    if value is None:
        return "na"
    if value >= 0.15:
        return "green"
    if value >= 0.05:
        return "yellow"
    return "red"


def score_revenue_growth(value):
    if value is None:
        return "na"
    if value >= 0.08:
        return "green"
    if value >= 0:
        return "yellow"
    return "red"


def score_free_cash_flow(value):
    if value is None:
        return "na"
    if value > 0:
        return "green"
    if value == 0:
        return "yellow"
    return "red"


def score_dividend(value):
    """value = payout ratio (0-1+). Geen dividend => 'na', telt niet mee."""
    if value is None:
        return "na"
    if value <= 0.6:
        return "green"
    if value <= 0.9:
        return "yellow"
    return "red"


METRICS = [
    {
        "id": "pe_ratio",
        "label": "Koers/Winst-verhouding",
        "unit": "x",
        "score_fn": score_pe_ratio,
        "explanation": "Lagere K/W duidt op een relatief goedkoper aandeel t.o.v. de winst.",
    },
    {
        "id": "debt_to_equity",
        "label": "Schuld / Eigen vermogen",
        "unit": "x",
        "score_fn": score_debt_to_equity,
        "explanation": "Lagere schuldgraad betekent minder financieel risico.",
    },
    {
        "id": "roe",
        "label": "Return on Equity",
        "unit": "%",
        "score_fn": score_roe,
        "explanation": "Hoe efficiënt het bedrijf winst maakt met het eigen vermogen.",
    },
    {
        "id": "revenue_growth",
        "label": "Omzetgroei (YoY)",
        "unit": "%",
        "score_fn": score_revenue_growth,
        "explanation": "Groei van de omzet ten opzichte van vorig jaar.",
    },
    {
        "id": "free_cash_flow",
        "label": "Free Cash Flow",
        "unit": "$",
        "score_fn": score_free_cash_flow,
        "explanation": "Positieve vrije kasstroom geeft financiële flexibiliteit.",
    },
    {
        "id": "dividend_payout",
        "label": "Dividend uitkeringsratio",
        "unit": "%",
        "score_fn": score_dividend,
        "explanation": "Lager percentage van de winst uitgekeerd = duurzamer dividend. Niet van toepassing als er geen dividend is.",
    },
]

COLOR_WEIGHT = {"green": 2, "yellow": 1, "red": 0}


def overall_color(colors):
    """colors: lijst van 'green'/'yellow'/'red'/'na'. 'na' telt niet mee."""
    relevant = [c for c in colors if c in COLOR_WEIGHT]
    if not relevant:
        return "na"
    avg = sum(COLOR_WEIGHT[c] for c in relevant) / len(relevant)
    if avg >= 1.5:
        return "green"
    if avg >= 0.75:
        return "yellow"
    return "red"
