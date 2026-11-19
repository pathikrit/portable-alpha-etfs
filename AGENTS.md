# Notes for agents

Lessons from building this page with the owner. Most of them came from a mistake that cost a review round.
Read this before you change `index.html` or `etf.json`.

## What the repo is

- `etf.json` is the data. `index.html` is the only page. Nothing else holds state.
- `make build` (`build.mjs`) writes `_site/index.html`: `index.html` with `etf.json` baked into its
  `<script id="etfs">` block. The page does not fetch its data, so it has no loading state.
  Opened directly, `index.html` shows an empty list; always look at the built page.
- There is no other build step. `index.html` loads Astryx, React, htm, Chart.js and Font Awesome from CDNs
  through an import map.
- `tests/etf.test.mjs` checks the data rules and the page logic. Run `make test`.
- `make dev` builds, serves `_site` at http://localhost:8000/ (`make dev PORT=8777` for a different port)
  and rebuilds when `index.html` or `etf.json` changes. Reload the browser to see a change.
- `.claude/skills/update-etfs/` keeps the data correct. **The rules for `etf.json` live in its `SKILL.md`.**
  Read that file before you edit the data; this file does not repeat them.
- `.github/workflows/pages.yml` runs the tests, then `make build`, and publishes `_site`.

## Before you say a change is done

1. `make test` passes.
2. If `etf.json` changed: `node .claude/skills/update-etfs/check.mjs` reports no flag that you cannot explain.
3. If `index.html` changed: you looked at a screenshot, in light and dark, and measured what you claim (see below).
4. A new control is in the URL hash, and a reload from the link gives the same view.
5. A new rule for the data has a test and a line in the skill. A new `what` value has an entry in `WHAT`.

## Design rules the owner set

**Text**
- No explanatory prose in the UI. No "how this works" paragraphs, no row-count summaries, no disclaimers,
  no long placeholders (the search box says "Search"). If a control needs a sentence to explain it,
  the control is wrong. Put secondary detail in hover text.
- Labels are short and use finance terms: "% of NAV", "% of gross", "Gross", "Leverage", "non-US listings".
  Do not invent words like "normalized" or "Stack" for a column.
- Do not show the same number two ways (170% and 1.70x). Pick one and make it prominent.
- Group names are short ("Classic Combos >1.75x") with hover text.

**Size and space**
- Size an input to its content. A ticker is 4 to 6 characters, so its field is about 108px, at every window width.
  A field that stretches to fill its column is a defect. This was raised three times.
- Tables are as wide as their content. No wide empty columns.
- Each ETF row is one line. Nothing is cut off, no badge is truncated, and there is no horizontal scroll.
  Use the page margins before you let a table scroll. Below the width where one-line rows fit, wrap; do not scroll.
- Separate things that are different. The Stack Builder is three divided columns: Holdings, Exposure, chart.
  A form stacked directly on a table reads as one "smushed" block.
- Put a control next to what it acts on. "Add holding" and "Reset" are directly under the holdings.
  "Suggest an edit" is on the ETF table, not in the page header.
- A control with a label is one line: label, then the control, aligned with its neighbours and with space between.

**Controls**
- Buttons must look like buttons and have a colour that means something. No borderless button for a real action,
  and no pale tint: Add is solid green, Reset and "Suggest an edit" are solid red.
  Reset is disabled when there is nothing to reset.
- Use Astryx components and variants first. Read the component docs in the npm package
  (`@astryxdesign/core/src/<Name>/<Name>.doc.mjs`) before you style something by hand.
- Remove features that do not earn their place. Column sorting and a per-row add button were both cut:
  alphabetical order and search are enough.
- A state tag replaces other marking. Closed funds have a red "Closed" tag, so no strikethrough.
- Errors are red with a Font Awesome icon. An invalid input (weights over 100%) shows an error
  in place of the result; it does not render a wrong chart.
- Text that the user typed must not be lost. A ticker that is typed but not picked from the menu
  becomes the holding when the field loses focus.
- Tables have vertical separators (`dividers="grid"`).

**Colour**
- One colour for each asset class, the same in the tags, the pie and the exposure table.
  The classes and colours are the `--c-*` variables and the `WHAT` map in `index.html`:
  green bonds; dark, medium and light blue for large-cap, global and small-cap equity; purple-blue long-short;
  gold commodities and miners; purple managed futures, carry and macro; red crypto; gray for a ticker not in the map.
- The table group does not come from the colour. CTA has the commodity colour (the owner's choice)
  but counts as Managed Futures.

**State**
- All UI state is in the URL hash: holdings, search, each toggle, the leverage range, collapsed groups, theme.
  Defaults are not written, so the plain URL stays clean.

**Chart**
- The pie is the main visual: large, with the asset and "% of gross" inside each slice.
  A slice too small for its label shows it on hover. Hover always gives both "% of NAV" and "% of gross".
- The circle is 100% of NAV. Weights below 100% leave the cash part of the circle empty.
- Leverage is gross exposure over total NAV. Uninvested weight is cash.

## Open question

- A fund with no ticker shows as `TBD-<position in etf.json>`. That number is not the row number in the table,
  because the table is grouped, and the owner found the mismatch confusing. The options were put to the owner
  (number them `TBD-1`..., use the row number, or make the `#` column fixed). Check the PR and recent commits
  for the decision before you touch this.

## How to work on this page

- **Look at it before you say it is done.** Take a screenshot in a headless browser after each visual change.
  Most review rounds were about things one screenshot would have caught: a stretched input, a clipped column,
  a truncated badge.
- **Measure, do not judge by eye.** For "nothing cut off" claims, check in the browser at several widths
  (768, 1024, 1325, 1464, 1920): `scrollWidth > clientWidth` on cells and badges, row heights, table scroll.
  A fix verified at one width broke at the owner's width more than once.
- **The phone layout is CSS only.** Below 700px a media query in `index.html` turns each ETF row into a block
  (ticker and leverage, then name, then allocation) and hides the `#` column. Do not add a second component tree
  for phones. Check 320, 360 and 390 wide as well as the desktop widths.
- **Check the narrow layout too.** A media query quietly brought back the wide ticker field after it was fixed.
- **Test with real data.** Placeholder rows with the same name gave duplicate row keys and a false grouping bug.
- **Use the control the way a person does.** The lost-ticker bug only appeared when text was typed and the field
  was left without a pick. Test typing, Tab, click-away and pick.
- **When a request has two readings, look at what the result would show.** "Pie missing a portion under 100%"
  meant weights under 100%, not gross exposure under 100%. The second reading almost never occurs,
  which was the sign that it was wrong.
- **Follow a literal instruction, then say where it conflicts.** The owner put CTA with commodities and also
  asked for purple managed futures. Do what was said and name the conflict in the reply; do not pick silently.
- **State an assumption when you act on it**, for example a two-handle range slider when "a slider" was asked for,
  or `main` when the owner said "master".
- **The owner reviews from a live page.** Run `make dev` and keep it running. Their screenshots can be from before the last push,
  so check which version a screenshot shows before you "fix" something that is already fixed.
- **Small commits, pushed to the PR after each round.** Update the PR body only; never change its title.

## Lessons about the data

- **Do not drop a fund the owner listed because the match is uncertain.** The owner listed a BlackRock fund with
  no ticker. Research found GMIX at low confidence, and it was left out; the owner had to ask for it.
  Keep the entry, mark what is not confirmed, and ask.
- **After a bulk edit, audit against the source list.** Compare every ticker the owner gave with `etf.json`
  and report each one that is missing, with the reason.
- **The owner's memory of a message can differ from the message.** Check the text before you agree or disagree.
- **Running `check.mjs` is not running the skill.** The script checks what is in the file.
  Finding new funds (step 4 of the skill) is a separate search, and it is the step that gets skipped.
- **A flag is a question, not an answer.** ESBG and HOLD were flagged "possibly closed" because they trade
  about 100 shares a day and the quote time was stale. Look at the daily bars and a primary source.

## Technical facts worth knowing

- Astryx without a build: `data-astryx-theme="neutral"` on `<html>`, three stylesheets from jsDelivr,
  and `@astryxdesign/core` from esm.sh with `?external=react,react-dom`. No `<Theme>` wrapper is needed.
- Light and dark: Astryx reads `html[data-theme]`. With no attribute, the OS setting decides.
- Theme tokens use `light-dark()`. A canvas cannot read them, so the chart resolves each colour through a
  temporary element and redraws when the scheme changes. Slice labels are white or black by the slice's lightness.
- A solid green or red button: Astryx has no such variant. Wrap a `primary` button in an element that sets
  `--color-accent` and `--color-on-accent` (classes `.go` and `.red`).
- Astryx `Badge` has one blue only, so the asset tags are the page's own `.chip` elements.
- Astryx `Table`: `useTableGroupedRows` gives the groups; column widths are `{type: 'pixel'}` or
  `{type: 'proportional', minWidth}`.
- Astryx `Slider`: `marks` gives the ticks, and a mark with a `label` is how a value shows under its handle.
- Astryx `Typeahead` holds an item, not text. `onChangeQuery` and `onBlur` are used to keep typed text.
- The pure logic is in `<script id="logic">` in `index.html` so that the tests can load it in Node.
  Keep DOM access out of that block.
- Font Awesome: the kit is Pro 6.7. Use `fa-duotone fa-solid fa-<name>`; brand icons are `fa-brands`.
- SEC: `www.sec.gov` refuses requests with no User-Agent and sometimes blocks automated requests for minutes.
  `efts.sec.gov` (full-text search) is more tolerant. X blocks automated requests, so a post can be confirmed
  only from search results.
- Yahoo keeps an empty quote record for a delisted fund, and its quote time lags for a fund that trades little.
