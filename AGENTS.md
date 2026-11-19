# Notes for agents

Lessons from building this page with the owner. Most of them came from a mistake that cost a review round.
Read this before you change `index.html` or `etf.json`.

## What the repo is

- `etf.json` is the data. `index.html` is the only page and reads it. Nothing else holds state.
- No build step. `index.html` loads Astryx, React, htm, Chart.js and Font Awesome from CDNs through an import map.
- `tests/etf.test.mjs` checks the data rules and the page logic. Run `node --test tests/*.test.mjs`
  (a bare `tests/` directory argument fails on new Node versions).
- `.claude/skills/update-etfs/` keeps the data correct. The data rules live in its `SKILL.md`; do not repeat them here.
- `.github/workflows/pages.yml` runs the tests and publishes `index.html` and `etf.json`.

## Design rules the owner set

**Text**
- No explanatory prose in the UI. No "how this works" paragraphs, no row-count summaries, no disclaimers,
  no long placeholders. If a control needs a sentence to explain it, the control is wrong.
  Put secondary detail in hover text.
- Labels are short and use finance terms: "% of NAV", "% of gross", "Gross", "Leverage", "non-US listings".
  Do not invent words like "normalized" or "Stack" for a column.
- Do not show the same number two ways (170% and 1.70x). Pick one and make it prominent.
- Names in `etf.json` have no "ETF" or "Fund" suffix. Group names are short ("Classic Combos >1.75x") with hover text.

**Size and space**
- Size an input to its content. A ticker is 4 to 6 characters, so its field is about 108px, at every window width.
  A field that stretches to fill its column is a defect.
- Tables are as wide as their content. No wide empty columns.
- Each ETF row is one line. Nothing is cut off, no badge is truncated, and there is no horizontal scroll.
  Use the page margins before you let a table scroll. Below the width where one-line rows fit, wrap; do not scroll.
- Separate things that are different. The Stack Builder is three divided columns: Holdings, Exposure, chart.
  A form stacked directly on a table reads as one "smushed" block.
- Put a button next to what it acts on. "Add holding" and "Reset" go directly under the holdings.

**Controls**
- Buttons must look like buttons. No borderless ghost button for a real action.
  Add is green, Reset is red and disabled when there is nothing to reset.
- Use Astryx components and variants first. Read the component docs in the npm package
  (`@astryxdesign/core/src/<Name>/<Name>.doc.mjs`) before you style something by hand.
- Remove features that do not earn their place. Column sorting and a per-row add button were both cut:
  alphabetical order and search are enough.
- A state tag replaces other marking. Closed funds have a red "Closed" tag, so no strikethrough.
- Errors are red with a Font Awesome icon. An invalid input (weights over 100%) shows an error
  in place of the result; it does not render a wrong chart.

**State**
- All UI state is in the URL hash: holdings, search, each toggle, the leverage range, collapsed groups, theme.
  A new control is not done until it is in the hash and a reload from the link gives the same view.
  Defaults are not written, so the plain URL stays clean.

**Chart**
- The pie is the main visual: large, with the asset and "% of gross" inside each slice.
  A slice too small for its label shows it on hover. Hover always gives both "% of NAV" and "% of gross".
- The circle is 100% of NAV. Weights below 100% leave the cash part of the circle empty.

## Data rules that came out of review

- `etf.json` is alphabetical by ticker; funds with no ticker are last, by name.
- Each `allocation` is ordered by `pct` descending, then by `what`.
- A fund with no ticker shows as `TBD-<position in etf.json>` and can be used in the builder.
  The number changes when the file changes; this is a known weakness.
- An upcoming fund with no issuer page links to a post about the filing (X or LinkedIn) if one exists,
  otherwise to the prospectus on sec.gov.
- The group is calculated from the allocation, not stored. Macro counts as Managed Futures.
- Leverage is gross exposure over total NAV. Uninvested weight is cash.

## How to work on this page

- **Look at it before you say it is done.** Take a screenshot in a headless browser after each visual change.
  Most review rounds were about things one screenshot would have caught: a stretched input, a clipped column,
  a truncated badge.
- **Measure, do not judge by eye.** For "nothing cut off" claims, check in the browser at several widths
  (768, 1024, 1300, 1464, 1920): `scrollWidth > clientWidth` on cells and badges, row heights, table scroll.
  A fix verified at one width broke at the owner's width more than once.
- **Check the narrow layout too.** A media query quietly brought back the wide ticker field after it was fixed.
- **Test with real data.** Placeholder rows with the same name gave duplicate row keys and a false grouping bug.
- **When a request has two readings, look at what the result would show.** "Pie missing a portion under 100%"
  meant weights under 100%, not gross exposure under 100%. The second reading almost never occurs,
  which was the sign that it was wrong.
- **State an assumption when you act on it**, for example a two-handle range slider when "a slider" was asked for,
  or `main` when the owner said "master".
- **The owner reviews from a live page.** Serve the repo (`python3 -m http.server`) and keep it running;
  `index.html` cannot load `etf.json` from a `file://` path. Their screenshots can be from before the last push,
  so check which version a screenshot shows before you "fix" something that is already fixed.
- **Small commits, pushed to the PR after each round.** Update the PR body only; never change its title.

## Technical facts worth knowing

- Astryx without a build: `data-astryx-theme="neutral"` on `<html>`, three stylesheets from jsDelivr,
  and `@astryxdesign/core` from esm.sh with `?external=react,react-dom`. No `<Theme>` wrapper is needed.
- Light and dark: Astryx reads `html[data-theme]`. With no attribute, the OS setting decides.
- Theme tokens use `light-dark()`. A canvas cannot read them, so the chart resolves each colour through a
  temporary element and redraws when the scheme changes.
- A green button: Astryx has no such variant. Wrap a `primary` button in an element that sets
  `--color-accent` to `--color-success`.
- Astryx `Table`: `dividers="grid"` gives vertical separators; `useTableGroupedRows` gives the groups;
  column widths are `{type: 'pixel'}` or `{type: 'proportional', minWidth}`.
- The pure logic is in `<script id="logic">` in `index.html` so that the tests can load it in Node.
  Keep DOM access out of that block.
- SEC: `www.sec.gov` refuses requests with no User-Agent and sometimes blocks automated requests for minutes.
  `efts.sec.gov` (full-text search) is more tolerant. Yahoo keeps an empty quote record for a delisted fund,
  so a quote that has no price is not proof of trading.
