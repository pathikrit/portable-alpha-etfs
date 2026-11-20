---
name: update-etfs
description: Make sure that each entry in etf.json is correct. Finds funds that have closed and upcoming funds that are trading now. Use it when the user asks to update, check or validate the ETF list.
---

# Update the ETF list

`etf.json` is the only data file. `make build` bakes it into the page; the page changes nothing in it.
Your task is to make `etf.json` agree with the facts of today.

## Rules for etf.json

- US-listed ETFs only. Do not add mutual funds, funds listed in other countries or UCITS funds.
- A fund is in the list only if it stacks exposures. The allocation must add to more than 100%.
- The required keys are `ticker`, `name`, `filing`, `url` and `allocation`. The optional keys are `closed` and `upcoming`.
  Do not add other keys.
  Do not add leverage (the page calculates it) or AUM (it changes).
- `ticker`: the exchange ticker. It is always there. Use `null` only for an upcoming fund that has no ticker yet.
- `name`: the official fund name from the SEC filing or from the issuer.
  Remove "ETF", "Fund" or "Exchange-Traded Fund" from the end of the name. Each entry is an ETF.
- `filing`: a link on sec.gov. Use the EDGAR series page:
  `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=<series ID>&type=485`.
  If there is no series ID, link to the filing index page.
- `url`: the fund page on the issuer's site. For a closed fund, the closure notice
  (the SEC 497 supplement or the issuer's press release). For an upcoming fund that has no page, a post on X or
  LinkedIn that tells about the filing. If there is no such post, the prospectus document on sec.gov.
- The entries are in alphabetical order by `ticker`. Funds that have no ticker are last, in order by `name`.
- `closed` and `upcoming`: write the key only when it is `true`. A key that is not there means `false`.
  Remove the key when it is no longer true. They are never `true` at the same time.
- `allocation`: a list of `{"pct": 100, "what": "SPY"}`. `pct` is a number. `what` is a well-known ticker
  for the exposure (SPY, GOVT) or a label (Gold, MF, BTC). Use labels that are already in the file where possible.
  `index.html` has the hover text and the asset class (which gives the color) of each label in `WHAT`.
  Add each new label there, or it shows in gray with no hover text.
- Put the parts of `allocation` in order: the largest `pct` first. Parts with the same `pct` go by asset class
  (equities, bonds, commodities, managed futures, crypto: `TIE_ORDER` in `index.html`), then `what` in alphabetical order.
  For example, `100 SPY`, `60 DBMF`.
- The page calculates the group from the allocation: BTC or ETH gives "Crypto";
  MF, CTA, Carry or Macro gives "Managed Futures"; the remaining funds are "Classic Combos", divided at 1.75x leverage.

## Procedure

1. Run the check from the repository root:

   ```bash
   node .claude/skills/update-etfs/check.mjs --links
   ```

   The check compares each entry with live quotes and with SEC records. It changes no files.
   The check is only the first step. It does not find new funds (step 4).
   `--links` also tests each `url` and `filing` link. It is slower.

2. Examine each flag. A flag is a question, not an answer: a fund that trades very little can get a
   `POSSIBLY CLOSED` flag, and a link can fail because the site refused the request. Do not change an entry on the flag alone. Find a primary source first:
   the SEC filing, the issuer's site or an exchange notice.

   | Flag | What to find | Change, if it is confirmed |
   | --- | --- | --- |
   | `POSSIBLY CLOSED`, `NOT FOUND` | A liquidation notice (SEC form 497) or a ticker change | `closed: true`, and `url` becomes the closure notice |
   | `NOW TRADING` | The fund page of the issuer | Remove `upcoming`, and `url` becomes the fund page |
   | `TICKER ASSIGNED`, `TICKER CHANGE` | The new ticker in the latest filing | Set `ticker`. Then run the check again |
   | `STILL TRADING` | If a different fund now uses the ticker | Usually no change. If the closure was cancelled, remove `closed` |
   | `DEAD LINK` | The new address of the page | Replace the link |

3. Examine each upcoming fund, because the check sees little of a fund that has no ticker.
   Open its `filing` link. A 485BPOS filing or a ticker shows that the launch is near or complete.
   A withdrawal (form AW or 485BXT that continues for many months) shows that the fund is possibly cancelled.
   Tell the user about a fund that looks cancelled. Do not remove it without the user's approval.

4. Look for new funds. Search EDGAR full text for recent 485APOS filings and search the web for new
   launches. Useful words: "return stacked", "portable alpha", "capital efficient", "plus managed futures", "stacked".
   Add each new fund that obeys the rules, with `upcoming: true` until it trades.

5. Keep `etf.json` in alphabetical order by `ticker`. Put the funds that have no ticker last, in alphabetical order by `name`.
   When an upcoming fund gets a ticker, move its entry to the correct position.

6. Run the tests, then run the check again. Continue until the tests pass and each remaining flag has an explanation.

   ```bash
   make test
   ```

7. If the user gave you a list of funds, compare each one with `etf.json`. Do not leave out a fund because
   the match is not certain: add it, tell the user what is not confirmed, and ask.
   Tell the user about each fund that is not in the file, with the reason (for example, a UCITS fund).

8. Give the user a report: what changed with the source of each change, the flags that remain and why,
   and the items that you could not confirm.

## Data sources

- Quotes: `https://query1.finance.yahoo.com/v8/finance/chart/<TICKER>?range=5d&interval=1d`.
  HTTP 404 shows that the symbol does not exist. `meta.regularMarketTime` is the last trade.
- EDGAR full-text search: `https://efts.sec.gov/LATEST/search-index?q=%22<words>%22&forms=485APOS,485BPOS,497`.
- EDGAR series search: `https://www.sec.gov/cgi-bin/series?company=<trust name>`.
- The SEC refuses requests that have no User-Agent. Use the User-Agent that is in `check.mjs`,
  and send fewer than 5 requests each second. `www.sec.gov` sometimes refuses automated requests for some minutes.
  If that occurs, wait or use a web fetch tool.
