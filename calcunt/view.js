// calcunt frontend. No backend, no build step: reads data/db.csv +
// data/goals.json + data/ntlabel/*.json directly in the browser. See SCHEMA.md.

const DB_CSV_URL = "data/db.csv";
const GOALS_URL = "data/goals.json";
const NTLABEL_DIR = "data/ntlabel";

const MEAL_ORDER = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 };
const MEALS = Object.keys(MEAL_ORDER);
// fixed order: also the fixed color-slot order in calcunt.css (--series-1..4)
const METRICS = ["calories", "carbs_g", "protein_g", "fat_g"];
const METRIC_TITLES = {
  calories: "Calories",
  carbs_g: "Carbs",
  protein_g: "Protein",
  fat_g: "Fat",
};
const METRIC_UNITS = {
  calories: "kcal",
  carbs_g: "g",
  protein_g: "g",
  fat_g: "g",
};

function log(...args) {
  console.log("[calcunt]", ...args);
}

function mealRank(meal) {
  return MEAL_ORDER.hasOwnProperty(meal) ? MEAL_ORDER[meal] : 99;
}

// goals.json is keyed by meal; day-level views (Today, Week, Month, All)
// use the daily total, which is just the sum across the four meals.
function dailyGoal(goals, metric) {
  return MEALS.reduce((sum, meal) => sum + (goals[meal]?.[metric] ?? 0), 0);
}

// -- fetching ---------------------------------------------------------

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  return res.text();
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  return res.json();
}

// -- parsing ------------------------------------------------------------

function parseCSV(text) {
  const lines = text.trim().split("\n").filter((l) => l.trim() !== "");
  const header = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    const row = {};
    header.forEach((key, i) => (row[key] = cells[i]));
    row.quantity_g = parseFloat(row.quantity_g);
    return row;
  });
  log(`parsed ${rows.length} rows from db.csv`);
  return rows;
}

async function loadNutritionLabels(foodIds) {
  const labels = new Map();
  await Promise.all(
    foodIds.map(async (id) => {
      try {
        const label = await fetchJSON(`${NTLABEL_DIR}/${id}.json`);
        labels.set(id, label);
        log(`loaded nutrition label: ${id}`);
      } catch (err) {
        console.warn(`[calcunt] missing nutrition label for "${id}":`, err.message);
        labels.set(id, {
          id,
          name: `${id} (missing label)`,
          per_g: 100,
          calories: 0,
          carbs_g: 0,
          protein_g: 0,
          fat_g: 0,
          fiber_g: 0,
        });
      }
    })
  );
  return labels;
}

function enrichRows(rows, labels) {
  return rows.map((row) => {
    const label = labels.get(row.food_id);
    const factor = row.quantity_g / label.per_g;
    return {
      date: row.date,
      meal: row.meal,
      food_id: row.food_id,
      name: label.name,
      quantity_g: row.quantity_g,
      calories: label.calories * factor,
      carbs_g: label.carbs_g * factor,
      protein_g: label.protein_g * factor,
      fat_g: label.fat_g * factor,
      fiber_g: label.fiber_g * factor,
    };
  });
}

// -- tabular view ---------------------------------------------------------

function renderTabular(enriched) {
  const body = document.getElementById("tabular-body");
  const card = document.getElementById("tabular-card");
  const status = document.getElementById("tabular-status");
  body.innerHTML = "";

  const dates = [...new Set(enriched.map((r) => r.date))].sort().reverse();
  log(`rendering tabular view: ${dates.length} days`);

  for (const date of dates) {
    const dayRows = enriched
      .filter((r) => r.date === date)
      .sort((a, b) => mealRank(a.meal) - mealRank(b.meal));

    const totals = { calories: 0, carbs_g: 0, protein_g: 0, fat_g: 0, fiber_g: 0 };

    for (const r of dayRows) {
      const tr = document.createElement("tr");
      const cells = [
        [r.date, false],
        [r.meal, false],
        [r.name, false],
        [r.quantity_g, true],
        [r.calories.toFixed(0), true],
        [r.carbs_g.toFixed(1), true],
        [r.protein_g.toFixed(1), true],
        [r.fat_g.toFixed(1), true],
        [r.fiber_g.toFixed(1), true],
      ];
      for (const [val, isNum] of cells) {
        const td = document.createElement("td");
        if (isNum) td.className = "num";
        td.textContent = val;
        tr.appendChild(td);
      }
      body.appendChild(tr);

      for (const m of Object.keys(totals)) totals[m] += r[m];
    }

    const totalTr = document.createElement("tr");
    totalTr.className = "day-total";
    const totalCells = [
      [date, false],
      ["total", false],
      ["", false],
      ["", true],
      [totals.calories.toFixed(0), true],
      [totals.carbs_g.toFixed(1), true],
      [totals.protein_g.toFixed(1), true],
      [totals.fat_g.toFixed(1), true],
      [totals.fiber_g.toFixed(1), true],
    ];
    for (const [val, isNum] of totalCells) {
      const td = document.createElement("td");
      if (isNum) td.className = "num";
      td.textContent = val;
      totalTr.appendChild(td);
    }
    body.appendChild(totalTr);
  }

  status.hidden = true;
  card.hidden = false;
}

// -- week / month bar charts ----------------------------------------------

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function trailingDates(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(fmtDate(d));
  }
  return days;
}

function computeSeries(enriched, days) {
  const series = {};
  for (const metric of METRICS) series[metric] = days.map(() => 0);

  for (const r of enriched) {
    const idx = days.indexOf(r.date);
    if (idx === -1) continue;
    for (const metric of METRICS) series[metric][idx] += r[metric];
  }

  log(`computed totals for ${days[0]} .. ${days[days.length - 1]}`, series);
  return { days, series };
}

// path for a bar with rounded top corners, square baseline (dataviz mark spec)
function roundedTopBarPath(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return (
    `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} ` +
    `L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`
  );
}

function weekdayShort(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

function dateShort(dateStr) {
  return dateStr.slice(5).replace("-", "/"); // MM/DD
}

function renderBarChart(metric, values, days, goal, opts = {}) {
  const labelEvery = opts.labelEvery ?? 1;
  const labelFormat = opts.labelFormat ?? "weekday";
  const unit = METRIC_UNITS[metric];
  const width = 300;
  const height = 150;
  const chartW = 292;
  const chartH = 96;
  const marginLeft = 4;
  const marginTop = 6;
  const slotWidth = chartW / values.length;
  const barWidth = Math.min(24, slotWidth * 0.55);
  const todayIndex = values.length - 1;
  const maxVal = Math.max(goal, ...values, 1) * 1.15;
  const y = (v) => chartH - (v / maxVal) * chartH;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const plot = document.createElementNS(svgNS, "g");
  plot.setAttribute("transform", `translate(${marginLeft},${marginTop})`);
  svg.appendChild(plot);

  const goalY = y(goal);
  const goalLine = document.createElementNS(svgNS, "line");
  goalLine.setAttribute("x1", 0);
  goalLine.setAttribute("x2", chartW);
  goalLine.setAttribute("y1", goalY);
  goalLine.setAttribute("y2", goalY);
  goalLine.setAttribute("class", "goal-line");
  plot.appendChild(goalLine);

  const goalLabel = document.createElementNS(svgNS, "text");
  goalLabel.setAttribute("x", 0);
  goalLabel.setAttribute("y", goalY - 4);
  goalLabel.setAttribute("class", "goal-label");
  goalLabel.textContent = `Goal ${goal}`;
  plot.appendChild(goalLabel);

  values.forEach((val, i) => {
    const isToday = i === todayIndex;
    const x = i * slotWidth + (slotWidth - barWidth) / 2;
    const barY = y(val);
    const barH = Math.max(chartH - barY, 0);

    if (barH > 0) {
      const bar = document.createElementNS(svgNS, "path");
      bar.setAttribute("d", roundedTopBarPath(x, barY, barWidth, barH, 4));
      bar.setAttribute("class", `bar-${metric}${isToday ? "" : " bar-muted"}`);
      const tip = document.createElementNS(svgNS, "title");
      tip.textContent = `${days[i]}: ${Math.round(val)} ${unit}`;
      bar.appendChild(tip);
      plot.appendChild(bar);
    }

    // label selectively: today always, others every `labelEvery` bars
    // counting back from today, to avoid overlap on dense charts (month view)
    if (isToday || (todayIndex - i) % labelEvery === 0) {
      const dayLabel = document.createElementNS(svgNS, "text");
      dayLabel.setAttribute("x", x + barWidth / 2);
      dayLabel.setAttribute("y", chartH + 14);
      dayLabel.setAttribute("class", `day-label${isToday ? " today" : ""}`);
      dayLabel.textContent = isToday
        ? "Today"
        : labelFormat === "date"
        ? dateShort(days[i])
        : weekdayShort(days[i]);
      plot.appendChild(dayLabel);
    }
  });

  const card = document.createElement("div");
  card.className = "card chart-card";

  const header = document.createElement("div");
  header.className = "chart-header";
  const dot = document.createElement("span");
  dot.className = `chart-dot chart-dot-${metric}`;
  header.appendChild(dot);
  header.appendChild(document.createTextNode(METRIC_TITLES[metric]));
  card.appendChild(header);

  const valueDiv = document.createElement("div");
  valueDiv.className = "chart-value";
  const numSpan = document.createElement("span");
  numSpan.textContent = Math.round(values[todayIndex]);
  const unitSpan = document.createElement("span");
  unitSpan.className = "unit";
  unitSpan.textContent = ` ${unit} today`;
  valueDiv.appendChild(numSpan);
  valueDiv.appendChild(unitSpan);
  card.appendChild(valueDiv);

  card.appendChild(svg);
  return card;
}

// renders the Week and Month tabs: same rounded-bar-plus-goal-line chart,
// just a different trailing window and label density. In "aggregate"
// granularity it's the usual 4 cards (one per metric, summed across meals).
// In "meal" granularity it's 4 groups of 4 cards, one group per meal, each
// scoped to that meal's own entries and that meal's own goal.
function renderMetricGrid(containerId, statusId, enriched, days, goals, opts, granularity) {
  const container = document.getElementById(containerId);
  const status = document.getElementById(statusId);
  container.innerHTML = "";

  if (granularity === "meal") {
    container.classList.add("stacked-groups");
    for (const meal of MEALS) {
      const mealSeries = computeSeries(
        enriched.filter((r) => r.meal === meal),
        days
      ).series;

      const heading = document.createElement("h2");
      heading.className = "meal-group-heading";
      heading.textContent = meal.charAt(0).toUpperCase() + meal.slice(1);
      container.appendChild(heading);

      const group = document.createElement("div");
      group.className = "metric-grid";
      for (const metric of METRICS) {
        const goal = goals[meal]?.[metric] ?? 0;
        group.appendChild(renderBarChart(metric, mealSeries[metric], days, goal, opts));
      }
      container.appendChild(group);
    }
  } else {
    container.classList.remove("stacked-groups");
    const { series } = computeSeries(enriched, days);
    for (const metric of METRICS) {
      container.appendChild(renderBarChart(metric, series[metric], days, dailyGoal(goals, metric), opts));
    }
  }

  log(`rendered ${containerId} (${granularity})`);
  status.hidden = true;
  container.hidden = false;
}

// -- today: today's totals vs goal, as activity rings ----------------------

// fixed order, matches --series-1..4 in calcunt.css
const METRIC_SERIES_VAR = {
  calories: "--series-1",
  carbs_g: "--series-2",
  protein_g: "--series-3",
  fat_g: "--series-4",
};

function metricColorHex(metric) {
  return getComputedStyle(document.documentElement).getPropertyValue(METRIC_SERIES_VAR[metric]).trim();
}

function renderRingCard(metric, value, goal) {
  const unit = METRIC_UNITS[metric];
  const rawProgress = goal > 0 ? value / goal : 0;

  // caption's numerator color = how close to goal, same buckets as the
  // All heatmap; the ring itself stays the metric's own color
  const deviationPct = goal > 0 ? (Math.abs(value - goal) / goal) * 100 : 0;
  const deviationTextClass = `dev-text-${deviationBucket(deviationPct)}`;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");

  const titleEl = document.createElementNS(svgNS, "title");
  titleEl.textContent = `${Math.round(value)} / ${goal} ${unit} (${Math.round(rawProgress * 100)}%)`;
  svg.appendChild(titleEl);

  // activity-ring.js: ported from the activity-rings reference project —
  // draws the ring itself (arc, gradient sheen, and the shadowed rounded
  // tip that keeps spinning past 100% instead of stopping flat)
  drawActivityRing(svg, { value: rawProgress, color: metricColorHex(metric), cx: 50, cy: 50, radius: 44, width: 10 });

  const percentLabel = document.createElementNS(svgNS, "text");
  percentLabel.setAttribute("x", 50);
  percentLabel.setAttribute("y", 50);
  percentLabel.setAttribute("dominant-baseline", "central");
  percentLabel.setAttribute("class", "ring-percent");
  percentLabel.textContent = `${Math.round(rawProgress * 100)}%`;
  svg.appendChild(percentLabel);

  const card = document.createElement("div");
  card.className = "card chart-card ring-card";

  const header = document.createElement("div");
  header.className = "chart-header";
  const dot = document.createElement("span");
  dot.className = `chart-dot chart-dot-${metric}`;
  header.appendChild(dot);
  header.appendChild(document.createTextNode(METRIC_TITLES[metric]));
  card.appendChild(header);

  card.appendChild(svg);

  const caption = document.createElement("div");
  caption.className = "ring-caption";
  const valueSpan = document.createElement("span");
  valueSpan.className = `value ${deviationTextClass}`;
  valueSpan.textContent = Math.round(value);
  caption.appendChild(valueSpan);
  caption.appendChild(document.createTextNode(` / ${goal} ${unit}`));
  card.appendChild(caption);

  return card;
}

function renderToday(enriched, goals, granularity) {
  const container = document.getElementById("today-content");
  const status = document.getElementById("today-status");
  container.innerHTML = "";

  const today = fmtDate(new Date());
  const todaysRows = enriched.filter((r) => r.date === today);
  log(`today: ${todaysRows.length} entries today (${today}, ${granularity})`);

  if (granularity === "meal") {
    container.classList.add("stacked-groups");
    for (const meal of MEALS) {
      const mealRows = todaysRows.filter((r) => r.meal === meal);

      const heading = document.createElement("h2");
      heading.className = "meal-group-heading";
      heading.textContent = meal.charAt(0).toUpperCase() + meal.slice(1);
      container.appendChild(heading);

      const group = document.createElement("div");
      group.className = "metric-grid";
      for (const metric of METRICS) {
        const value = mealRows.reduce((sum, r) => sum + r[metric], 0);
        const goal = goals[meal]?.[metric] ?? 0;
        group.appendChild(renderRingCard(metric, value, goal));
      }
      container.appendChild(group);
    }
  } else {
    container.classList.remove("stacked-groups");
    for (const metric of METRICS) {
      const value = todaysRows.reduce((sum, r) => sum + r[metric], 0);
      const card = renderRingCard(metric, value, dailyGoal(goals, metric));
      container.appendChild(card);
    }
  }

  log("rendered today rings");
  status.hidden = true;
  container.hidden = false;
  renderDeviationLegend("today-legend");
}

// -- all: github-style heatmap, colored by deviation from goal ------------
//
// Anchored the same way github does it: the rightmost column is the
// current week (Sunday .. today, no cells past today), and columns extend
// backward in full Sunday-Saturday weeks from there. That means the
// leftmost day is always a Sunday, so there are never leading blank
// cells to pad out — no off-by-one gap at either edge.
//
// The number of weeks shown is however many full columns fit the card's
// rendered width, so it has to be measured after the card is actually in
// the (visible) DOM — see renderAll's lazy call from initTabs.

// keep in sync with .heatmap-grid / .heatmap-cell in calcunt.css
const HEATMAP_CELL = 12;
const HEATMAP_GAP = 3;

// thresholds and names must match --dev-* in calcunt.css exactly — that's
// the single place colors are defined; this is just where the boundaries
// (percentage points of |actual - goal| / goal) live.
function deviationBucket(pct) {
  if (pct <= 7.5) return "perfect";
  if (pct <= 15) return "good";
  if (pct <= 22.5) return "poor";
  if (pct <= 30) return "bad";
  return "terrible";
}

function createHeatmapCardShell(metric) {
  const card = document.createElement("div");
  card.className = "card chart-card";

  const header = document.createElement("div");
  header.className = "chart-header";
  const dot = document.createElement("span");
  dot.className = `chart-dot chart-dot-${metric}`;
  header.appendChild(dot);
  header.appendChild(document.createTextNode(METRIC_TITLES[metric]));
  card.appendChild(header);

  const grid = document.createElement("div");
  grid.className = "heatmap-grid";
  card.appendChild(grid);

  return { card, grid };
}

// grid is an empty block-level grid container, so its clientWidth is the
// card's real available content width regardless of how many cells it
// ends up holding — must be called after `grid` is attached to a visible
// (non-`hidden`) part of the DOM, or this reads 0.
function weeksThatFit(grid) {
  const width = grid.clientWidth;
  return Math.max(1, Math.floor((width + HEATMAP_GAP) / (HEATMAP_CELL + HEATMAP_GAP)));
}

function populateHeatmapGrid(grid, metric, days, enriched, goal) {
  const unit = METRIC_UNITS[metric];
  const todayStr = fmtDate(new Date());
  grid.innerHTML = "";

  for (const date of days) {
    const dayRows = enriched.filter((r) => r.date === date);
    const cell = document.createElement("div");
    cell.className = "heatmap-cell";

    if (dayRows.length === 0) {
      cell.classList.add("dev-none");
      cell.title = `${date}: no data logged`;
    } else {
      const actual = dayRows.reduce((sum, r) => sum + r[metric], 0);
      const pct = goal > 0 ? (Math.abs(actual - goal) / goal) * 100 : 0;
      cell.classList.add(`dev-${deviationBucket(pct)}`);
      cell.title = `${date}: ${Math.round(actual)} / ${goal} ${unit} (${pct.toFixed(0)}% off goal)`;
    }

    if (date === todayStr) cell.classList.add("today");
    grid.appendChild(cell);
  }
}

// worst -> best, with the bucket's threshold for a hover tooltip (a fast
// custom one — see .dev-legend-swatch::after — not the native `title`
// attribute, which has a browser-imposed ~1s+ delay with no way to tune it)
const DEVIATION_LEGEND = [
  { bucket: "terrible", label: "Terrible (>30% off goal)" },
  { bucket: "bad", label: "Bad (22.5–30% off goal)" },
  { bucket: "poor", label: "Poor (15–22.5% off goal)" },
  { bucket: "good", label: "Good (7.5–15% off goal)" },
  { bucket: "perfect", label: "Perfect (≤7.5% off goal)" },
];

function renderDeviationLegend(containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  const worstLabel = document.createElement("span");
  worstLabel.className = "dev-legend-label";
  worstLabel.textContent = "Worst";
  container.appendChild(worstLabel);

  for (const { bucket, label } of DEVIATION_LEGEND) {
    const swatch = document.createElement("span");
    swatch.className = `dev-legend-swatch dev-${bucket}`;
    swatch.setAttribute("data-tooltip", label);
    container.appendChild(swatch);
  }

  const bestLabel = document.createElement("span");
  bestLabel.className = "dev-legend-label";
  bestLabel.textContent = "Best";
  container.appendChild(bestLabel);

  container.hidden = false;
}

function renderAll(enriched, goals) {
  const container = document.getElementById("all-content");
  const status = document.getElementById("all-status");
  container.innerHTML = "";
  status.hidden = true;
  container.hidden = false;
  renderDeviationLegend("all-legend");

  const shells = METRICS.map((metric) => ({ metric, ...createHeatmapCardShell(metric) }));
  for (const { card } of shells) container.appendChild(card);

  const weeks = weeksThatFit(shells[0].grid);
  const today = new Date();
  const totalDays = (weeks - 1) * 7 + (today.getDay() + 1); // anchor to Sunday..today
  const days = trailingDates(totalDays);

  for (const { metric, grid } of shells) {
    populateHeatmapGrid(grid, metric, days, enriched, dailyGoal(goals, metric));
  }

  log(`rendered all-view heatmaps: ${weeks} weeks (${days[0]} .. ${days[days.length - 1]})`);
}

// -- tabs -------------------------------------------------------------

// the "All" heatmap needs its real rendered width to pick how many weeks
// fit, which only exists once its panel is actually visible — so it's
// (re)rendered on every visit to that tab instead of once at load time,
// via onShowAll.
const GRANULARITY_TABS = ["today", "week", "month"];

function initTabs(onShowAll) {
  const buttons = document.querySelectorAll("#main-tabs .tab-btn");
  const mealToggle = document.getElementById("meal-toggle");

  function activate(btn) {
    const target = btn.dataset.tab;
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.hidden = panel.id !== `tab-${target}`;
    });
    buttons.forEach((b) => b.classList.toggle("active", b === btn));
    const showToggle = GRANULARITY_TABS.includes(target);
    mealToggle.classList.toggle("meal-toggle-inactive", !showToggle);
    mealToggle.tabIndex = showToggle ? 0 : -1;
    if (target === "all") onShowAll();
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      log(`switching to tab: ${btn.dataset.tab}`);
      activate(btn);
    });
  });
  activate(buttons[0]);
}

// "meals" on/off toggle, only meaningful on Week/Month (see initTabs).
// off = aggregate (default), on = broken out per meal.
function initGranularityTabs(onChange) {
  const btn = document.getElementById("meal-toggle");
  btn.addEventListener("click", () => {
    const isOn = btn.getAttribute("aria-pressed") === "true";
    const granularity = isOn ? "aggregate" : "meal";
    log(`switching granularity: ${granularity}`);
    btn.setAttribute("aria-pressed", String(!isOn));
    onChange(granularity);
  });
}

// -- init ---------------------------------------------------------------

async function init() {
  log("init: loading db.csv and goals.json");
  const state = { enriched: null, goals: null, granularity: "aggregate" };

  function renderWeekAndMonth() {
    if (!state.enriched) return;
    renderMetricGrid(
      "week-charts",
      "week-status",
      state.enriched,
      trailingDates(7),
      state.goals,
      { labelEvery: 1, labelFormat: "weekday" },
      state.granularity
    );
    renderMetricGrid(
      "month-charts",
      "month-status",
      state.enriched,
      trailingDates(30),
      state.goals,
      { labelEvery: 5, labelFormat: "date" },
      state.granularity
    );
  }

  initTabs(() => {
    if (state.enriched) renderAll(state.enriched, state.goals);
  });
  initGranularityTabs((granularity) => {
    state.granularity = granularity;
    if (state.enriched) renderToday(state.enriched, state.goals, state.granularity);
    renderWeekAndMonth();
  });

  let rows, goals;
  try {
    const [csvText, goalsJSON] = await Promise.all([
      fetchText(DB_CSV_URL),
      fetchJSON(GOALS_URL),
    ]);
    rows = parseCSV(csvText);
    goals = goalsJSON;
  } catch (err) {
    console.error("[calcunt] failed to load data:", err);
    const message = "failed to load data: " + err.message;
    for (const id of ["today-status", "week-status", "month-status", "all-status", "tabular-status"]) {
      document.getElementById(id).textContent = message;
    }
    return;
  }

  const foodIds = [...new Set(rows.map((r) => r.food_id))];
  log(`loading ${foodIds.length} nutrition labels`, foodIds);
  const labels = await loadNutritionLabels(foodIds);

  const enriched = enrichRows(rows, labels);
  log(`enriched ${enriched.length} rows with nutrition data`);
  state.enriched = enriched;
  state.goals = goals;

  renderToday(enriched, goals, state.granularity);
  renderWeekAndMonth();

  // in case the user already switched to the All tab while this was loading
  if (!document.getElementById("tab-all").hidden) renderAll(enriched, goals);

  renderTabular(enriched);
  log("init complete");
}

document.addEventListener("DOMContentLoaded", init);
