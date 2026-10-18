"""
Step 2 — Transform & analyse.
Loads data/raw/*.csv into DuckDB, runs the SQL models in sql/ and exports
  • data/processed/*.csv  — one tidy file per business question
  • report/data.json      — the payload the interactive report reads

Run:  python src/build_dataset.py
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
RAW, PROCESSED, SQL = ROOT / "data" / "raw", ROOT / "data" / "processed", ROOT / "sql"
REPORT = ROOT / "report"

DIVISION_RO = {
    "TOTAL": "Total coș",
    "CP01": "Alimente și băuturi nealcoolice", "CP02": "Băuturi alcoolice și tutun",
    "CP03": "Îmbrăcăminte și încălțăminte", "CP04": "Locuință, apă, energie",
    "CP05": "Mobilier și articole casnice", "CP06": "Sănătate", "CP07": "Transport",
    "CP08": "Informații și comunicații", "CP09": "Recreere, sport și cultură",
    "CP10": "Educație", "CP11": "Restaurante și cazare",
    "CP12": "Asigurări și servicii financiare", "CP13": "Îngrijire personală și altele",
}
GROUP_RO = {"Food & drinks": "Alimente & băuturi", "Housing & energy": "Locuință & energie",
            "Transport": "Transport", "Services": "Servicii", "Other goods": "Alte bunuri"}
COUNTRY_RO = {
    "AT": "Austria", "BE": "Belgia", "BG": "Bulgaria", "CY": "Cipru", "CZ": "Cehia",
    "DE": "Germania", "DK": "Danemarca", "EE": "Estonia", "EL": "Grecia", "ES": "Spania",
    "FI": "Finlanda", "FR": "Franța", "HR": "Croația", "HU": "Ungaria", "IE": "Irlanda",
    "IT": "Italia", "LT": "Lituania", "LU": "Luxemburg", "LV": "Letonia", "MT": "Malta",
    "NL": "Țările de Jos", "PL": "Polonia", "PT": "Portugalia", "RO": "România",
    "SE": "Suedia", "SI": "Slovenia", "SK": "Slovacia",
}


def records(con: duckdb.DuckDBPyConnection, sql: str) -> list[dict]:
    df = con.sql(sql).df()
    for col in df.columns:
        if str(df[col].dtype).startswith("datetime"):
            df[col] = df[col].dt.strftime("%Y-%m")
    df = df.astype(object).where(df.notna(), None)
    return df.to_dict(orient="records")


def main() -> None:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(ROOT / "data" / "inflation.duckdb"))

    for csv in sorted(RAW.glob("*.csv")):
        con.execute(f"CREATE OR REPLACE TABLE raw_{csv.stem} AS "
                    f"SELECT * FROM read_csv_auto('{csv.as_posix()}', all_varchar=true)")
    for sql_file in sorted(SQL.glob("*.sql")):
        con.execute(sql_file.read_text(encoding="utf-8"))

    # Tidy exports, one per mart
    for view in ["mart_headline", "mart_rank", "mart_cumulative", "mart_contributions",
                 "mart_real_wage", "mart_heatmap", "qa_contributions"]:
        con.sql(f"SELECT * FROM {view}").write_csv(str(PROCESSED / f"{view.removeprefix('mart_')}.csv"))

    latest = con.sql("SELECT max(month) FROM mart_headline WHERE ro IS NOT NULL").fetchone()[0]
    streak = con.sql("SELECT * FROM mart_ro_streak LIMIT 1").fetchone()
    qa = con.sql("""SELECT round(avg(abs(residual_pp)), 2), round(max(abs(residual_pp)), 2)
                    FROM qa_contributions WHERE geo = 'RO'""").fetchone()

    payload = {
        "meta": {
            "generated": date.today().isoformat(),
            "latest_month": latest.strftime("%Y-%m"),
            "source": "Eurostat — HICP (prc_hicp_minr, prc_hicp_ainr, prc_hicp_iw), "
                      "minimum wages (earn_mw_cur)",
            "ro_top_streak": {"start": streak[0].strftime("%Y-%m"),
                              "end": streak[1].strftime("%Y-%m"), "months": streak[2]},
            "contribution_residual_pp": {"mean_abs": qa[0], "max_abs": qa[1]},
        },
        "labels": {"division": DIVISION_RO, "group": GROUP_RO, "country": COUNTRY_RO},
        "headline": records(con, "SELECT * FROM mart_headline WHERE ro IS NOT NULL"),
        "ranking_latest": records(con, f"""
            SELECT geo, yoy_pct, rank_in_eu FROM mart_rank
            WHERE month = DATE '{latest}' ORDER BY yoy_pct DESC"""),
        "ro_rank_history": records(con, "SELECT month, rank_in_eu FROM mart_rank WHERE geo = 'RO' ORDER BY month"),
        "eu_latest": con.sql(f"SELECT yoy_pct FROM stg_hicp_wide WHERE geo='EU27' AND coicop='TOTAL' "
                             f"AND month = DATE '{latest}'").fetchone()[0],
        "cumulative": records(con, "SELECT * FROM mart_cumulative ORDER BY ro_pct DESC"),
        "contributions": records(con, """
            SELECT month, grp, round(contribution_pp, 3) AS pp FROM mart_contributions
            WHERE geo = 'RO' AND month >= DATE '2021-01-01' ORDER BY month, grp"""),
        "divisions_latest": records(con, f"""
            SELECT h.coicop, h.yoy_pct AS ro_yoy, e.yoy_pct AS eu_yoy,
                   round(w.weight * h.yoy_pct, 2) AS ro_contribution_pp, round(w.weight * 100, 1) AS ro_weight_pct
            FROM stg_hicp_wide h
            JOIN stg_hicp_wide e ON e.geo = 'EU27' AND e.coicop = h.coicop AND e.month = h.month
            JOIN stg_weights w ON w.geo = 'RO' AND w.coicop = h.coicop AND w.year = year(h.month)
            WHERE h.geo = 'RO' AND h.month = DATE '{latest}' AND length(h.coicop) = 4
            ORDER BY ro_contribution_pp DESC"""),
        "energy": records(con, """
            SELECT month,
                   max(yoy_pct) FILTER (WHERE coicop = 'CP0451') AS electricity,
                   max(yoy_pct) FILTER (WHERE coicop = 'CP0452') AS gas,
                   max(yoy_pct) FILTER (WHERE coicop = 'CP0722') AS fuels
            FROM stg_hicp_wide WHERE geo = 'RO' AND month >= DATE '2024-01-01'
            GROUP BY month ORDER BY month"""),
        "heatmap": records(con, """
            SELECT coicop, year, yoy_pct FROM mart_heatmap
            WHERE geo = 'RO' AND year >= 2016 ORDER BY coicop, year"""),
        "real_wage": records(con, "SELECT * FROM mart_real_wage"),
    }
    (REPORT / "data.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Latest month: {latest:%Y-%m} | RO #1 streak: {streak[2]} months | "
          f"contribution residual: mean {qa[0]} pp, max {qa[1]} pp")


if __name__ == "__main__":
    main()
