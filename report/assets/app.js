import {
  fmt, fmtSigned, monthLabel, lineChart, hBarChart, stackedChart, dumbbell, heatmap,
  legend, dataTable, sparkline, divergingColor,
} from "./charts.js";

const $ = (s, r = document) => r.querySelector(s);
const bind = (key, text) => document.querySelectorAll(`[data-k="${key}"]`).forEach((n) => (n.textContent = text));
const pct = (v, d = 1) => `${fmt(v, d)}%`;
const details = (chartId) => $(`#${chartId}`).closest(".card").querySelector("details.data");

const res = await fetch("data.json");
const D = await res.json();
const L = D.labels;
const latest = D.meta.latest_month;
const H = D.headline;
const last = H[H.length - 1];

/* ---------------- Text bindings ---------------- */
const rankRo = D.ranking_latest.find((r) => r.geo === "RO");
const cumTotal = D.cumulative.find((r) => r.coicop === "TOTAL");
const contribLatest = Object.fromEntries(D.contributions.filter((r) => r.month === latest).map((r) => [r.grp, r.pp]));
const rw = D.real_wage;
const rwAt = (m) => rw.find((r) => r.month === m);
const frozen = rwAt("2025-01");
const preRaise = rwAt("2026-06");
const r2018 = rwAt("2018-01"), rLast = rw[rw.length - 1];
const rankHist = D.ro_rank_history;

bind("nMonths", H.length);
bind("latestLong", monthLabel(latest, true).replace(/^(\w)/, (c) => c));
bind("generated", new Date(D.meta.generated).toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" }));
bind("roLatest", pct(last.ro)); bind("roLatest2", pct(last.ro)); bind("roLatest3", pct(last.ro));
bind("euLatest", pct(last.eu));
bind("gapLatest", `${fmtSigned(last.ro - last.eu)} pp`);
bind("roRank", rankRo.rank_in_eu);
bind("streak", D.meta.ro_top_streak.months); bind("streak2", D.meta.ro_top_streak.months);
bind("streakRange", `${monthLabel(D.meta.ro_top_streak.start, true)} – ${monthLabel(D.meta.ro_top_streak.end, true)}`);
bind("cumRo", `+${fmt(cumTotal.ro_pct)}%`); bind("cumEu", `+${fmt(cumTotal.eu_pct)}%`);
bind("cumRo2", `${fmt(cumTotal.ro_pct, 0)}%`); bind("cumEu2", `${fmt(cumTotal.eu_pct, 0)}%`);
bind("wageErosion", `${fmtSigned((preRaise.real_idx / frozen.real_idx - 1) * 100)}%`);
bind("frozenWage", frozen.min_wage_lei.toLocaleString("ro-RO")); bind("frozenWage2", frozen.min_wage_lei.toLocaleString("ro-RO"));
bind("monthsAbove", H.filter((r) => r.ro > r.eu).length);
bind("monthsTop", rankHist.filter((r) => r.rank_in_eu === 1).length);
bind("pre2025", pct(H.find((r) => r.month === "2025-06").ro));
bind("post2025", pct(H.find((r) => r.month === "2025-08").ro));
bind("servicesPp", fmt(contribLatest["Services"])); bind("foodPp", fmt(contribLatest["Food & drinks"]));
bind("qa", fmt(D.meta.contribution_residual_pp.mean_abs, 2)); bind("qa2", fmt(D.meta.contribution_residual_pp.mean_abs, 2));
bind("qaMax", fmt(D.meta.contribution_residual_pp.max_abs, 2));
bind("fuelsLatest", `+${fmt(D.energy[D.energy.length - 1].fuels)}%`); bind("fuelsLatest2", `+${fmt(D.energy[D.energy.length - 1].fuels, 0)}%`);
bind("divAbove", D.divisions_latest.filter((r) => r.ro_yoy > r.eu_yoy).length);
bind("foodYoy", pct(D.divisions_latest.find((r) => r.coicop === "CP01").ro_yoy));
bind("real2018", `${fmtSigned((rLast.real_idx / r2018.real_idx - 1) * 100, 0)}%`);

/* ---------------- Charts ---------------- */
const PEERS = [
  { key: "ro", label: "România", short: "RO", color: "--s1", visible: true, locked: true },
  { key: "eu", label: "Media UE-27", short: "UE", color: "--s2", visible: true },
  { key: "hu", label: "Ungaria", short: "HU", color: "--s3", visible: false },
  { key: "pl", label: "Polonia", short: "PL", color: "--s4", visible: false },
  { key: "bg", label: "Bulgaria", short: "BG", color: "--s5", visible: false },
];
const GROUPS = [
  { key: "Food & drinks", color: "--s1" }, { key: "Housing & energy", color: "--s2" },
  { key: "Transport", color: "--s3" }, { key: "Services", color: "--s4" }, { key: "Other goods", color: "--s5" },
].map((g) => ({ ...g, label: L.group[g.key] }));

const renderers = [];
const register = (fn) => { renderers.push(fn); fn(); };

// chips for peer comparison (colour follows the country, never its position)
const chipBox = $("#peerChips");
for (const p of PEERS) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "chip"; b.setAttribute("aria-pressed", String(p.visible));
  if (p.locked) b.disabled = true;
  const k = document.createElement("span"); k.className = "key-line"; k.style.background = `var(${p.color})`;
  b.append(k, document.createTextNode(p.label));
  b.addEventListener("click", () => { p.visible = !p.visible; b.setAttribute("aria-pressed", String(p.visible)); renderHeadline(); });
  chipBox.appendChild(b);
}
const peak = H.reduce((a, b) => (b.ro > a.ro ? b : a));
const renderHeadline = () => {
  const narrow = $("#chartHeadline").clientWidth < 560;
  lineChart($("#chartHeadline"), {
    data: H, series: PEERS, height: narrow ? 320 : 400,
    ariaLabel: "Inflația anuală în România și UE, 2015–2026",
    annotations: [
      { x: peak.month, label: `Vârf RO: ${pct(peak.ro)}`, short: "Vârf" },
      { x: "2025-07", label: "Expiră plafonarea energiei", short: "Plafonare" },
      { x: "2025-08", label: "TVA 19% → 21%", short: "TVA" },
    ],
  });
};
register(renderHeadline);
dataTable(details("chartHeadline"), ["Luna", "România", "UE-27", "Ungaria", "Polonia", "Bulgaria", "Diferență RO–UE (pp)"],
  [...H].reverse().map((r) => [monthLabel(r.month, true), fmt(r.ro), fmt(r.eu), fmt(r.hu), fmt(r.pl), fmt(r.bg), fmtSigned(r.gap_pp)]));

register(() => hBarChart($("#chartRanking"), {
  rows: D.ranking_latest.map((r) => ({ label: L.country[r.geo] || r.geo, value: r.yoy_pct, highlight: r.geo === "RO", bold: r.geo === "RO",
    extra: [{ value: `#${r.rank_in_eu}`, label: "loc în UE" }] })),
  refLine: { value: D.eu_latest, label: `UE ${pct(D.eu_latest)}` }, rowH: 22,
  ariaLabel: "Clasamentul inflației anuale în UE",
}));
dataTable(details("chartRanking"), ["Loc", "Țară", "Inflație anuală"],
  D.ranking_latest.map((r) => [r.rank_in_eu, L.country[r.geo] || r.geo, pct(r.yoy_pct)]));

const topByYear = Object.entries(rankHist.reduce((acc, r) => {
  const y = r.month.slice(0, 4); acc[y] = (acc[y] || 0) + (r.rank_in_eu === 1 ? 1 : 0); return acc;
}, {}));
register(() => hBarChart($("#chartTopYears"), {
  rows: topByYear.map(([y, n]) => ({ label: y === latest.slice(0, 4) ? `${y} (ian–${monthLabel(latest).split(" ")[0]})` : y,
    value: n, highlight: n > 0, bold: n > 0, tipLabel: "luni pe locul 1" })),
  valueFormat: (v) => (v === 1 ? "1 lună" : `${v} luni`), rowH: 24,
  ariaLabel: "Numărul de luni pe locul 1 în UE, pe an",
}));
dataTable(details("chartTopYears"), ["An", "Luni pe locul 1"], topByYear.map(([y, n]) => [y, n]));

// contributions
const months = [...new Set(D.contributions.map((r) => r.month))];
const values = {}; for (const r of D.contributions) (values[r.month] ||= {})[r.grp] = r.pp;
const total = Object.fromEntries(H.map((r) => [r.month, r.ro]));
legend($("#legendContrib"), [...GROUPS, { label: "Inflația totală", color: "var(--ink)" }].map((g) => ({ label: g.label, color: g.color })), "rect");
$("#legendContrib").lastElementChild.firstElementChild.className = "key-line";
register(() => stackedChart($("#chartContrib"), {
  months, groups: GROUPS, values, total, height: $("#chartContrib").clientWidth < 560 ? 320 : 400,
  ariaLabel: "Contribuții pe grupe la inflația anuală din România",
}));
dataTable(details("chartContrib"), ["Luna", ...GROUPS.map((g) => g.label), "Suma", "Publicat"],
  [...months].reverse().map((m) => {
    const vs = GROUPS.map((g) => values[m][g.key] || 0);
    return [monthLabel(m, true), ...vs.map((v) => fmt(v, 2)), fmt(vs.reduce((a, b) => a + b, 0), 2), fmt(total[m])];
  }));

register(() => hBarChart($("#chartDivContrib"), {
  rows: D.divisions_latest.map((r) => ({ label: L.division[r.coicop], value: r.ro_contribution_pp, highlight: true,
    tipLabel: "contribuție (pp)",
    extra: [{ value: pct(r.ro_yoy), label: "rată anuală" }, { value: pct(r.ro_weight_pct), label: "pondere în coș" }] })),
  valueFormat: (v) => `${fmt(v, 2)} pp`, rowH: 26,
  ariaLabel: "Contribuția fiecărei divizii la inflația curentă",
}));
dataTable(details("chartDivContrib"), ["Categorie", "Pondere", "Rată anuală", "Contribuție (pp)"],
  D.divisions_latest.map((r) => [L.division[r.coicop], pct(r.ro_weight_pct), pct(r.ro_yoy), fmt(r.ro_contribution_pp, 2)]));

const RO = { key: "ro", label: "România", color: "--s1" }, EU = { key: "eu", label: "Media UE-27", color: "--s2" };
for (const id of ["#legendDivYoy", "#legendCum"]) legend($(id), [RO, EU].map((s) => ({ label: s.label, color: s.color })), "dot");
const divYoy = [...D.divisions_latest].sort((a, b) => b.ro_yoy - a.ro_yoy).map((r) => ({ label: L.division[r.coicop], ro: r.ro_yoy, eu: r.eu_yoy }));
register(() => dumbbell($("#chartDivYoy"), { rows: divYoy, a: RO, b: EU, rowH: 26, valueFormat: (v) => `${fmtSigned(v)}%`,
  ariaLabel: "Rata anuală pe categorii, România vs UE" }));
dataTable(details("chartDivYoy"), ["Categorie", "România", "UE-27"], divYoy.map((r) => [r.label, pct(r.ro), pct(r.eu)]));

// energy
const ENERGY = [
  { key: "electricity", label: "Electricitate", long: "Electricitate", short: "Electr.", color: "--s1" },
  { key: "gas", label: "Gaze naturale", long: "Gaze", short: "Gaze", color: "--s2" },
  { key: "fuels", label: "Carburanți", long: "Carburanți", short: "Carb.", color: "--s3" },
];
legend($("#legendEnergy"), ENERGY.map((s) => ({ label: s.label, color: `var(${s.color})` })));
register(() => lineChart($("#chartEnergy"), {
  data: D.energy, series: ENERGY, height: 340,
  ariaLabel: "Variația anuală a prețurilor la energie în România",
  annotations: [
    { x: "2025-07", label: "Iul 2025: expiră plafonarea", short: "Plafonare" },
    { x: "2026-07", label: "Iul 2026: efect de bază", short: "Efect de bază" },
  ],
}));
dataTable(details("chartEnergy"), ["Luna", "Electricitate", "Gaze", "Carburanți"],
  [...D.energy].reverse().map((r) => [monthLabel(r.month, true), pct(r.electricity), pct(r.gas), pct(r.fuels)]));

// cumulative
const cumRows = D.cumulative.map((r) => ({ label: L.division[r.coicop], ro: r.ro_pct, eu: r.eu_pct, emphasis: r.coicop === "TOTAL" }));
register(() => dumbbell($("#chartCum"), { rows: cumRows, a: RO, b: EU, rowH: 30, ariaLabel: "Creșterea cumulată a prețurilor din 2015, pe categorii" }));
dataTable(details("chartCum"), ["Categorie", "România", "UE-27", "Diferență (pp)"],
  cumRows.map((r) => [r.label, `+${fmt(r.ro)}%`, `${fmtSigned(r.eu)}%`, fmtSigned(r.ro - r.eu)]));

// heatmap
const heatIdx = {}; for (const r of D.heatmap) heatIdx[`${r.coicop}|${r.year}`] = r.yoy_pct;
const years = [...new Set(D.heatmap.map((r) => r.year))].sort();
const SHORT = { TOTAL: "Total", CP01: "Alimente", CP02: "Alcool, tutun", CP03: "Îmbrăcăminte", CP04: "Locuință, energie",
  CP05: "Mobilier", CP06: "Sănătate", CP07: "Transport", CP08: "Comunicații", CP09: "Recreere", CP10: "Educație",
  CP11: "Restaurante", CP12: "Asigurări, fin.", CP13: "Îngrijire pers." };
const heatRows = Object.keys(SHORT).map((k) => ({ key: k, label: L.division[k], short: SHORT[k], emphasis: k === "TOTAL" }));
const renderHeat = () => {
  heatmap($("#chartHeat"), { rows: heatRows, cols: years, get: (r, c) => heatIdx[`${r}|${c}`], cap: 15,
    ariaLabel: "Inflația medie anuală pe categorii și ani, România" });
  const stops = [-15, -7.5, 0, 7.5, 15].map((v, i) => `${divergingColor(v, 15).fill} ${i * 25}%`);
  $("#heatScale").style.background = `linear-gradient(90deg, ${stops.join(",")})`;
};
register(renderHeat);
dataTable(details("chartHeat"), ["Categorie", ...years.map(String)],
  heatRows.map((r) => [r.label, ...years.map((y) => fmt(heatIdx[`${r.key}|${y}`]))]));

// real wage
const WAGE = [
  { key: "nominal_idx", label: "Salariu minim nominal", long: "Nominal", short: "Nom.", color: "--s1" },
  { key: "real_idx", label: "Salariu minim real", long: "Real", short: "Real", color: "--s3" },
  { key: "prices_idx", label: "Prețuri (HICP)", long: "Prețuri", short: "Preț.", color: "--s2" },
];
legend($("#legendWage"), WAGE.map((s) => ({ label: s.label, color: `var(${s.color})` })));
register(() => lineChart($("#chartWage"), {
  data: rw, series: WAGE, height: 360, yFormat: (v) => fmt(v, 0), tipFormat: (v) => fmt(v, 1),
  refY: { value: 100, label: "2015 = 100" },
  ariaLabel: "Salariul minim nominal și real vs prețuri, indice 2015 = 100",
  annotations: [
    { x: "2018-01", label: "2018: transferul contribuțiilor", short: "2018" },
    { x: "2025-01", label: "Salariu înghețat 18 luni", short: "Înghețare" },
  ],
}));
dataTable(details("chartWage"), ["Luna", "Salariu minim (lei)", "Nominal", "Prețuri", "Real"],
  [...rw].reverse().map((r) => [monthLabel(r.month, true), r.min_wage_lei.toLocaleString("ro-RO"), fmt(r.nominal_idx), fmt(r.prices_idx), fmt(r.real_idx)]));

// sparkline in hero
const renderSpark = () => sparkline($("#spark"), H.slice(-36).map((r) => r.ro), { ref: last.eu });
register(renderSpark);

/* ---------------- Re-render on resize & theme ---------------- */
let raf, lastW = window.innerWidth;
window.addEventListener("resize", () => {
  if (window.innerWidth === lastW) return; lastW = window.innerWidth;
  cancelAnimationFrame(raf); raf = requestAnimationFrame(() => renderers.forEach((f) => f()));
});
const themeBtn = $("#theme");
themeBtn.addEventListener("click", () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = dark ? "light" : "dark";
  try { localStorage.setItem("theme", root.dataset.theme); } catch (e) {}
  renderHeat();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderHeat);
