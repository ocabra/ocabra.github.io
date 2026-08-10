# calcunt — working notes for Claude

This is the operational guide for logging meals into this app during a
normal chat. For exact file formats, see `SCHEMA.md` — this file is the
step-by-step "what do I actually do" companion to it.

There is no backend. You (Claude, in conversation) are the backend: you
edit `data/db.csv` and `data/ntlabel/*.json` directly and push to github.
The website only reads.

## Adding a log entry (the common case)

For each food item the user mentions eating:

1. **Find or create its nutrition label.** Check whether
   `data/ntlabel/<food_id>.json` already exists for that food
   (`ls data/ntlabel/` or grep for the name). Reuse it if so —
   don't create near-duplicates like `rice` and `white_rice`.
   If it doesn't exist, create it (see below).
2. **Append one row per item to `db.csv`**:
   `date,meal,food_id,quantity_g`. Don't compute calories/macros
   yourself — the site derives them from the label at render time.
3. **Commit and push** with a short message, e.g.
   `log: lunch 2026-08-09 (rice, chicken)`.

Ask the user for anything you can't infer: which meal (breakfast/
lunch/dinner/snack) if unclear from context, and the date if it isn't
today.

## Creating a nutrition label (`data/ntlabel/<food_id>.json`)

`food_id` is a `snake_case` slug, no spaces, that becomes the
filename. Pick something specific enough not to collide
(`chicken_breast_grilled`, not `chicken`).

All values in the file are **per 100g**. Sources, in order of
preference:

1. **A photo of a nutrition facts label** (the user sends a picture).
   Read the values off it directly. Nutrition labels are almost
   always given **per serving**, not per 100g — you must convert:
   ```
   per_100g_value = per_serving_value / serving_size_g * 100
   ```
   The serving size in grams is printed on the label (e.g. "Serving
   size: 2/3 cup (55g)"). If the label gives serving size in a volume
   unit only (cups, tbsp) with no gram equivalent, ask the user or use
   a well-known standard conversion, and note the assumption in your
   reply so they can correct it.
2. **A known packaged/branded food** you can look up (nutrition is
   usually public/printed). Same per-100g conversion applies.
3. **A generic/home-cooked food** with no label (e.g. "grilled
   chicken breast", "white rice, cooked"). Use standard reference
   values for that food *as prepared* (cooked rice ≠ raw rice — they
   have different macros per 100g). Say in your reply that you used a
   generic estimate, not the user's exact ingredient.

Write the file per the schema in `SCHEMA.md`:

```json
{
  "id": "chicken_breast_grilled",
  "name": "Chicken breast, grilled",
  "per_g": 100,
  "calories": 165,
  "carbs_g": 0,
  "protein_g": 31,
  "fat_g": 3.6,
  "fiber_g": 0
}
```

`per_g` is always `100` — always convert to that basis before writing
the file, don't store per-serving numbers with a comment about it.

## Logging quantity (`quantity_g` in db.csv)

Always grams. If the user gives you a home measure ("a cup of rice",
"a scoop of protein powder"), convert to grams using a reasonable
standard conversion and say what you assumed, so they can correct it
if it's off for their specific case.

## `data/diet.txt` — the source of truth for goals.json

`data/diet.txt` is the user's actual nutritionist-prescribed meal
plan (in Portuguese), covering breakfast/lunch/dinner/snack with a
few interchangeable options per meal. `goals.json` was derived from
it — per SCHEMA.md, goals are set **per meal** and day-level views sum
them.

If the user updates `diet.txt` (new plan version), regenerate the
affected meal(s) in `goals.json`:

1. For each meal, pick the *representative* option (the first one, or
   whichever the user says they actually follow most).
2. Sum that option's items using their `data/ntlabel/*.json` values
   (create labels for any new ingredient — see above). Ignore
   supplements with no meaningful calories (creatine, glutamine,
   probiotics).
3. Write the meal's `{calories, carbs_g, protein_g, fat_g}` totals
   into `goals.json` under that meal's key.
4. Tell the user this is an estimate from a representative choice, not
   an exact figure — the plan offers alternatives on purpose, and day
   to day the real intake will vary around it.

**Items in the current `diet.txt` skipped when building labels**,
because they're specific branded/compounded products with no reliable
public nutrition data: *Manipulado I*, *Frescatino*, *queijo meia
cura*, *Alere*, *coxinha do Rogério*, and the composite *sanduíche
natural*. If the user logs one of these, ask them for the label (a
photo works) rather than guessing.

## Things to double check before pushing

- `food_id` in the new `db.csv` row matches an existing
  `data/ntlabel/<food_id>.json` file exactly (typos silently show
  up as "missing nutrition label" on the site, with zeroed macros —
  check the browser console debug log if something looks off).
- `date` is `YYYY-MM-DD`, `meal` is one of `breakfast` / `lunch` /
  `dinner` / `snack`.
- You're appending to `db.csv`, not reordering or rewriting existing
  rows.
