# schema

calcunt has no backend. All data lives in flat files inside this
directory and is read directly by `view.js` in the browser. Claude
(in a normal chat, outside this repo's code) is the one who edits
these files and pushes to github when the user reports a meal.

There are three kinds of file, all under `data/` (`assets/` is reserved
for visual/brand files like the logo — not data):

## 1. `data/db.csv` — the log

One row per food item eaten. Not pre-aggregated: if lunch was rice
and chicken, that's two rows.

```
date,meal,food_id,quantity_g
2026-08-09,lunch,rice_white_cooked,150
2026-08-09,lunch,chicken_breast_grilled,120
```

Columns:

- `date` — `YYYY-MM-DD`
- `meal` — one of `breakfast`, `lunch`, `dinner`, `snack`
- `food_id` — references `data/ntlabel/<food_id>.json` (see below)
- `quantity_g` — grams eaten, integer or decimal

No calories or macros are stored here on purpose — they're derived
at render time from `quantity_g` and the food's nutrition label.
This means fixing a wrong nutrition value later fixes every past
entry automatically, instead of requiring an edit to every csv row.

## 2. `data/ntlabel/<food_id>.json` — nutrition labels

One file per distinct food, values given per 100g. `food_id` is the
filename (without `.json`) and must be a simple slug
(`snake_case`, no spaces) — it's what `db.csv` rows reference.

```json
{
  "id": "rice_white_cooked",
  "name": "White rice, cooked",
  "per_g": 100,
  "calories": 130,
  "carbs_g": 28.2,
  "protein_g": 2.7,
  "fat_g": 0.3,
  "fiber_g": 0.4
}
```

`per_g` is always 100 in practice (values are always given per
100g) but is kept explicit rather than assumed.

To log a new food: create its `data/ntlabel/<food_id>.json` once,
then reference `food_id` from as many `db.csv` rows as needed.

## 3. `data/goals.json` — targets, per meal

Targets are set **per meal**, not just per day, so the data supports
comparing how a specific meal (e.g. lunch) trends over time, not only
the daily aggregate. Every day-level view (Today rings, Week/Month
goal line, All heatmap) uses the **daily total**, computed by summing
the four meals — there's no separate top-level daily number to keep
in sync by hand.

```json
{
  "breakfast": { "calories": 400, "carbs_g": 50, "protein_g": 35, "fat_g": 10 },
  "lunch":     { "calories": 550, "carbs_g": 48, "protein_g": 47, "fat_g": 18 },
  "dinner":    { "calories": 510, "carbs_g": 40, "protein_g": 46, "fat_g": 18 },
  "snack":     { "calories": 310, "carbs_g": 32, "protein_g": 30, "fat_g": 8 }
}
```

The four keys match `db.csv`'s `meal` values exactly. No `fiber_g`
goal — the goal-based views only track calories and the three
macronutrients, per DESIGN.md. Fiber still shows in the tabular view.

These particular numbers were estimated from `data/diet.txt` (see
CLAUDE.md for the estimation approach) — update them there if the
diet plan changes.

## adding a meal (workflow for Claude)

1. For each food item, find or create its `data/ntlabel/<id>.json`.
2. Append one `db.csv` row per item: `date,meal,food_id,quantity_g`.
3. Commit and push.

view.js does all the calorie/macro math from these three files —
nothing else needs to be computed by hand before writing to the csv.
