-- =====================================================================
-- 01 · STAGING — typed, cleaned views over the raw Eurostat extracts
-- =====================================================================

-- Monthly HICP (headline + categories) in one long table
CREATE OR REPLACE VIEW stg_hicp_monthly AS
WITH unioned AS (
    SELECT geo, coicop18, unit, time, value FROM raw_hicp_headline_monthly
    UNION ALL
    SELECT geo, coicop18, unit, time, value FROM raw_hicp_categories_monthly
)
SELECT
    CASE geo WHEN 'EU27_2020' THEN 'EU27' ELSE geo END        AS geo,
    coicop18                                                  AS coicop,
    unit,
    strptime(time || '-01', '%Y-%m-%d')::DATE                 AS month,
    value::DOUBLE                                             AS value
FROM unioned
WHERE value IS NOT NULL;

-- Rate of change and index side by side (one row per geo × item × month)
CREATE OR REPLACE VIEW stg_hicp_wide AS
SELECT
    geo, coicop, month,
    max(value) FILTER (WHERE unit = 'RCH_A') AS yoy_pct,
    max(value) FILTER (WHERE unit = 'I15')   AS index_2015
FROM stg_hicp_monthly
GROUP BY ALL;

-- Basket weights, per mille → share of basket (0–1)
CREATE OR REPLACE VIEW stg_weights AS
SELECT
    CASE geo WHEN 'EU27_2020' THEN 'EU27' ELSE geo END AS geo,
    coicop18                                           AS coicop,
    time::INT                                          AS year,
    value::DOUBLE / 1000.0                             AS weight
FROM raw_hicp_weights;

-- Statutory monthly minimum wage, expanded from half-years to months
CREATE OR REPLACE VIEW stg_min_wage AS
WITH sem AS (
    SELECT geo, currency, value::DOUBLE AS wage,
           make_date(left(time, 4)::INT, CASE WHEN right(time, 1) = '1' THEN 1 ELSE 7 END, 1) AS start_month
    FROM raw_minimum_wage
)
SELECT s.geo, s.currency, s.wage,
       (s.start_month + to_months(m.i))::DATE AS month
FROM sem s
CROSS JOIN range(0, 6) AS m(i);
