"""
Step 1 — Extract.
Downloads the raw series from the Eurostat Dissemination API (JSON-stat 2.0)
and stores them as tidy CSV files in data/raw/.

Run:  python src/fetch_eurostat.py
"""
from __future__ import annotations

import itertools
from pathlib import Path

import pandas as pd
import requests

API = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{dataset}"
RAW = Path(__file__).resolve().parents[1] / "data" / "raw"

EU27 = ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES", "FI", "FR", "HR", "HU",
        "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"]
DIVISIONS = [f"CP{i:02d}" for i in range(1, 14)]
# Hand-picked items behind the 2025-2026 story (energy + staples)
ITEMS = ["CP0451", "CP0452", "CP0722", "CP0111", "CP0112", "CP0114", "CP0115", "CP0116",
         "CP0117", "CP0441", "CP111"]
START = "2015-01"


def fetch(dataset: str, **params) -> pd.DataFrame:
    """Query one Eurostat dataset and flatten the JSON-stat cube into a long DataFrame."""
    query = [("format", "JSON"), ("lang", "EN")]
    for key, value in params.items():
        for v in value if isinstance(value, (list, tuple)) else [value]:
            query.append((key, v))
    resp = requests.get(API.format(dataset=dataset), params=query, timeout=180)
    resp.raise_for_status()
    js = resp.json()

    dims, sizes = js["id"], js["size"]
    # position -> code for every dimension
    codes = [sorted(js["dimension"][d]["category"]["index"].items(), key=lambda kv: kv[1])
             for d in dims]
    labels = {d: js["dimension"][d]["category"].get("label", {}) for d in dims}
    values, status = js.get("value", {}), js.get("status", {})

    rows = []
    for flat, combo in enumerate(itertools.product(*[range(s) for s in sizes])):
        key = str(flat)
        if key not in values:
            continue
        row = {d: codes[i][combo[i]][0] for i, d in enumerate(dims)}
        row["value"] = values[key]
        row["flag"] = status.get(key, "")
        rows.append(row)

    df = pd.DataFrame(rows)
    for d in dims:
        if d not in ("time", "freq"):
            df[f"{d}_label"] = df[d].map(labels[d])
    print(f"  {dataset:<16} {len(df):>7,} rows  (updated {js.get('updated', '?')})")
    return df


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    print("Downloading from Eurostat ...")

    # Monthly HICP (ECOICOP v2): annual rate + index 2015=100, headline, all EU countries
    fetch("prc_hicp_minr", geo=EU27 + ["EU27_2020", "EA"], coicop18="TOTAL",
          unit=["RCH_A", "I15"], sinceTimePeriod=START
          ).to_csv(RAW / "hicp_headline_monthly.csv", index=False)

    # Monthly HICP by division + selected items, Romania vs EU
    fetch("prc_hicp_minr", geo=["RO", "EU27_2020"], coicop18=DIVISIONS + ITEMS,
          unit=["RCH_A", "I15"], sinceTimePeriod=START
          ).to_csv(RAW / "hicp_categories_monthly.csv", index=False)

    # Annual average rate by division (for the heatmap)
    fetch("prc_hicp_ainr", geo=["RO", "EU27_2020"], coicop18=["TOTAL"] + DIVISIONS,
          unit="RCH_A_AVG", sinceTimePeriod="2015"
          ).to_csv(RAW / "hicp_categories_annual.csv", index=False)

    # Basket weights (per mille) — needed for contribution analysis
    fetch("prc_hicp_iw", geo=["RO", "EU27_2020"], coicop18=["TOTAL"] + DIVISIONS + ITEMS,
          sinceTimePeriod="2021"
          ).to_csv(RAW / "hicp_weights.csv", index=False)

    # Statutory minimum wage, national currency + EUR + PPS
    fetch("earn_mw_cur", geo=["RO", "BG", "HU", "PL", "CZ", "HR", "SK"],
          sinceTimePeriod="2015-S1"
          ).to_csv(RAW / "minimum_wage.csv", index=False)

    print(f"Done -> {RAW}")


if __name__ == "__main__":
    main()
