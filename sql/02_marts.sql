-- =====================================================================
-- 02 · MARTS — one view per business question
-- =====================================================================

-- Categories used in the contribution analysis (COICOP 2018 divisions → 5 groups)
CREATE OR REPLACE VIEW dim_group AS
SELECT * FROM (VALUES
    ('CP01', 'Food & drinks'),        ('CP02', 'Food & drinks'),
    ('CP04', 'Housing & energy'),
    ('CP07', 'Transport'),
    ('CP03', 'Other goods'),          ('CP05', 'Other goods'),
    ('CP06', 'Services'), ('CP08', 'Services'), ('CP09', 'Services'), ('CP10', 'Services'),
    ('CP11', 'Services'), ('CP12', 'Services'), ('CP13', 'Services')
) AS t(coicop, grp);

-- Q1 · How far is Romania from the EU, month by month?
CREATE OR REPLACE VIEW mart_headline AS
SELECT
    month,
    max(yoy_pct) FILTER (WHERE geo = 'RO')   AS ro,
    max(yoy_pct) FILTER (WHERE geo = 'EU27') AS eu,
    max(yoy_pct) FILTER (WHERE geo = 'HU')   AS hu,
    max(yoy_pct) FILTER (WHERE geo = 'PL')   AS pl,
    max(yoy_pct) FILTER (WHERE geo = 'BG')   AS bg,
    ro - eu                                   AS gap_pp
FROM stg_hicp_wide
WHERE coicop = 'TOTAL'
GROUP BY month
ORDER BY month;

-- Q2 · Where does Romania rank among the 27 member states each month?
CREATE OR REPLACE VIEW mart_rank AS
SELECT
    geo, month, yoy_pct,
    rank() OVER (PARTITION BY month ORDER BY yoy_pct DESC) AS rank_in_eu
FROM stg_hicp_wide
WHERE coicop = 'TOTAL' AND geo NOT IN ('EU27', 'EA') AND yoy_pct IS NOT NULL;

-- Consecutive months with Romania at #1 (gaps-and-islands)
CREATE OR REPLACE VIEW mart_ro_streak AS
WITH flagged AS (
    SELECT month, rank_in_eu = 1 AS is_top,
           row_number() OVER (ORDER BY month)
         - row_number() OVER (PARTITION BY rank_in_eu = 1 ORDER BY month) AS island
    FROM mart_rank WHERE geo = 'RO'
)
SELECT min(month) AS streak_start, max(month) AS streak_end, count(*) AS months
FROM flagged WHERE is_top
GROUP BY island
ORDER BY streak_end DESC;

-- Q3 · Cumulative price increase since 2015, by division (latest month)
CREATE OR REPLACE VIEW mart_cumulative AS
WITH latest AS (SELECT max(month) AS m FROM stg_hicp_wide WHERE coicop = 'TOTAL' AND geo = 'RO')
SELECT
    w.coicop,
    max(w.index_2015 - 100) FILTER (WHERE geo = 'RO')   AS ro_pct,
    max(w.index_2015 - 100) FILTER (WHERE geo = 'EU27') AS eu_pct
FROM stg_hicp_wide w, latest
WHERE w.month = latest.m
  AND (w.coicop = 'TOTAL' OR length(w.coicop) = 4)       -- headline + 13 divisions
GROUP BY w.coicop;

-- Q4 · What drives inflation? Contribution (pp) = basket weight × yoy rate.
--      Weights of the same calendar year are used (HICP is chain-linked annually).
CREATE OR REPLACE VIEW mart_contributions AS
SELECT
    h.geo, h.month, g.grp,
    sum(w.weight * h.yoy_pct) AS contribution_pp
FROM stg_hicp_wide h
JOIN dim_group  g ON g.coicop = h.coicop
JOIN stg_weights w ON w.geo = h.geo AND w.coicop = h.coicop AND w.year = year(h.month)
WHERE h.yoy_pct IS NOT NULL
GROUP BY ALL;

-- Quality check: sum of contributions vs. published headline rate
CREATE OR REPLACE VIEW qa_contributions AS
SELECT c.geo, c.month,
       round(sum(c.contribution_pp), 2)                  AS sum_of_contributions,
       any_value(t.yoy_pct)                              AS published_headline,
       round(sum(c.contribution_pp) - any_value(t.yoy_pct), 2) AS residual_pp
FROM mart_contributions c
JOIN stg_hicp_wide t ON t.geo = c.geo AND t.month = c.month AND t.coicop = 'TOTAL'
GROUP BY c.geo, c.month;

-- Q5 · Purchasing power of the minimum wage (Romania): nominal vs. prices, 2015 = 100
CREATE OR REPLACE VIEW mart_real_wage AS
WITH base AS (
    SELECT avg(wage) AS w2015 FROM stg_min_wage
    WHERE geo = 'RO' AND currency = 'NAC' AND year(month) = 2015
), series AS (
    SELECT m.month, m.wage, h.index_2015
    FROM stg_min_wage m
    JOIN stg_hicp_wide h ON h.geo = 'RO' AND h.coicop = 'TOTAL' AND h.month = m.month
    WHERE m.geo = 'RO' AND m.currency = 'NAC'
)
SELECT month,
       wage                                     AS min_wage_lei,
       round(100 * wage / base.w2015, 1)        AS nominal_idx,
       round(index_2015, 1)                     AS prices_idx,
       round(100 * (wage / base.w2015) / (index_2015 / 100), 1) AS real_idx
FROM series, base
ORDER BY month;

-- Q6 · Annual inflation heatmap, Romania by division
CREATE OR REPLACE VIEW mart_heatmap AS
SELECT CASE geo WHEN 'EU27_2020' THEN 'EU27' ELSE geo END AS geo,
       coicop18 AS coicop, time::INT AS year, value::DOUBLE AS yoy_pct
FROM raw_hicp_categories_annual
WHERE value IS NOT NULL;
