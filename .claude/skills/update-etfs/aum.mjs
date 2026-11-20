#!/usr/bin/env node
// Writes the net assets of each trading fund into etf.json as aum: { amount, last_checked }.
// Run from the repository root: node .claude/skills/update-etfs/aum.mjs
import { mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Yahoo wants a cookie and a crumb; this package gets them. It is not an official API.
// If the call starts to fail, try a newer version first.
const YAHOO = 'yahoo-finance2@4.0.6';
const file = new URL('../../../etf.json', import.meta.url);
const etfs = JSON.parse(readFileSync(file, 'utf8'));
const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time
const usd = (amount) => `$${(amount / 1e6).toFixed(1)}M`;

// A closed fund can keep an old figure at Yahoo, and an upcoming fund has none. Ask for neither.
const trading = (etf) => etf.ticker && !etf.closed && !etf.upcoming;
const tickers = etfs.filter(trading).map((etf) => etf.ticker);

// One request takes every ticker. A symbol that Yahoo does not know is absent from the answer.
// The package exits before a pipe gets all of its output (it stops at 64 KB), so its output goes to a file.
const dir = mkdtempSync(join(tmpdir(), 'aum-'));
const out = join(dir, 'quotes.json');
let answer;
try {
  execFileSync('npx', ['--yes', YAHOO, 'quote', JSON.stringify(tickers)], { stdio: ['ignore', openSync(out, 'w'), 'inherit'] });
  answer = readFileSync(out, 'utf8');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
const quotes = new Map(JSON.parse(answer).map((quote) => [quote.symbol, quote]));
if (!quotes.size) throw new Error('Yahoo gave no quotes. etf.json is not changed.');

const flags = [];
const updated = etfs.map((etf) => {
  const { aum: old, ...rest } = etf;
  let aum;
  if (trading(etf)) {
    const amount = quotes.get(etf.ticker)?.netAssets;
    if (Number.isFinite(amount) && amount > 0) {
      aum = { amount: Math.round(amount), last_checked: today };
      console.log(`${etf.ticker.padEnd(6)} ${usd(aum.amount).padStart(10)}${old ? `  (was ${usd(old.amount)} on ${old.last_checked})` : ''}`);
    } else {
      aum = old; // Keep the old figure. Its date shows its age.
      flags.push(`${etf.ticker.padEnd(6)} NO AUM: Yahoo has no net assets${old ? `; kept the figure of ${old.last_checked}` : ''}.  [${etf.name}]`);
    }
  } else if (old) {
    flags.push(`${(etf.ticker || 'no ticker').padEnd(6)} AUM REMOVED: the fund is ${etf.closed ? 'closed' : 'upcoming'}.  [${etf.name}]`);
  }
  if (!aum) return rest;
  // aum goes immediately before allocation.
  const { allocation, ...head } = rest;
  return { ...head, aum, allocation };
});

writeFileSync(file, `${JSON.stringify(updated, null, 2)}\n`);
console.log(`\n${tickers.length} trading funds. ${flags.length} to examine${flags.length ? ':' : '.'}`);
for (const text of flags) console.log(`  ${text}`);
