#!/usr/bin/env node
// Checks each entry of etf.json against live data. Prints a report. Changes no files.
// Run from the repository root: node .claude/skills/update-etfs/check.mjs [--links]
import { readFileSync } from 'node:fs';

const STALE_DAYS = 7; // No trade for this many days: the fund has possibly closed.
const SEC_AGENT = 'etf-list-checker 1.0 (automated; no contact configured)';
const checkLinks = process.argv.includes('--links');
const etfs = JSON.parse(readFileSync(new URL('../../../etf.json', import.meta.url), 'utf8'));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url, headers) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
  return response.json();
}

// Last trade of a ticker. Returns null when the symbol does not exist.
async function quote(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=5d&interval=1d`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const meta = (await getJson(url, { 'User-Agent': 'Mozilla/5.0' })).chart.result[0].meta;
      const days = (Date.now() / 1000 - meta.regularMarketTime) / 86400;
      return { days, date: new Date(meta.regularMarketTime * 1000).toISOString().slice(0, 10), name: meta.longName || meta.shortName || '' };
    } catch (error) {
      if (error.status === 404) return null;
      await sleep(1500 * (attempt + 1));
    }
  }
  return { error: true };
}

// SEC series ID -> ticker, for funds that have a ticker on record at the SEC.
async function secTickers() {
  try {
    const file = await getJson('https://www.sec.gov/files/company_tickers_mf.json', { 'User-Agent': SEC_AGENT });
    return new Map(file.data.map(([, seriesId, , symbol]) => [seriesId, symbol]));
  } catch (error) {
    console.log(`note: the SEC ticker file is not available (${error.message}). Series checks are skipped.\n`);
    return new Map();
  }
}

async function linkStatus(url) {
  const sec = new URL(url).hostname.endsWith('sec.gov');
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': sec ? SEC_AGENT : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36' },
      redirect: 'follow', signal: AbortSignal.timeout(20000),
    });
    return response.status;
  } catch {
    return 0;
  }
}

const series = await secTickers();
const flags = [];
const flag = (etf, text) => flags.push(`${(etf.ticker || 'no ticker').padEnd(10)} ${text}  [${etf.name}]`);

for (const etf of etfs) {
  const state = etf.closed ? 'closed' : etf.upcoming ? 'upcoming' : 'trading';
  const seriesId = (etf.filing.match(/S\d{9}/) || [])[0];
  const secTicker = seriesId && series.get(seriesId);
  let line = `${(etf.ticker || '-').padEnd(6)} ${state.padEnd(9)}`;

  if (etf.ticker) {
    const q = await quote(etf.ticker);
    await sleep(250);
    if (q && q.error) {
      line += ' quote: no answer';
      flag(etf, 'CHECK BY HAND: the quote service gave no answer.');
    } else {
      const fresh = q && q.days <= STALE_DAYS;
      line += q ? ` last trade ${q.date}` : ' no quote';
      if (state === 'trading' && !q) flag(etf, 'NOT FOUND: marked as trading, but there is no quote. Closed, renamed or not launched?');
      if (state === 'trading' && q && !fresh) flag(etf, `POSSIBLY CLOSED: the last trade was ${q.date}.`);
      if (state === 'upcoming' && fresh) flag(etf, `NOW TRADING: marked as upcoming, but it traded on ${q.date} as "${q.name}".`);
      if (state === 'closed' && fresh) flag(etf, `STILL TRADING: marked as closed, but it traded on ${q.date}. Possibly the ticker has a new owner ("${q.name}").`);
    }
    if (secTicker && secTicker !== etf.ticker) flag(etf, `TICKER CHANGE: the SEC series ${seriesId} now has the ticker ${secTicker}.`);
  } else {
    line += ' no ticker';
    if (secTicker) flag(etf, `TICKER ASSIGNED: the SEC series ${seriesId} now has the ticker ${secTicker}.`);
  }

  if (checkLinks) {
    for (const key of ['url', 'filing']) {
      const status = await linkStatus(etf[key]);
      await sleep(300);
      // 401/403/429 usually mean "no robots", not a dead page.
      if (status === 404 || status === 410 || status === 0) flag(etf, `DEAD LINK: ${key} gave ${status || 'no answer'}: ${etf[key]}`);
    }
  }
  console.log(line);
}

console.log(`\n${etfs.length} funds checked. ${flags.length} to examine${flags.length ? ':' : '.'}`);
for (const text of flags) console.log(`  ${text}`);
