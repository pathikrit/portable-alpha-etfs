// Run: make test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const etfs = JSON.parse(readFileSync(new URL('etf.json', root), 'utf8'));
const page = readFileSync(new URL('index.html', root), 'utf8');

// index.html keeps its pure logic in <script id="logic">. Load that block here.
const logic = page.match(/<script id="logic">([\s\S]*?)<\/script>/)[1];
const PA = vm.runInNewContext(`${logic}; PA`);

const REQUIRED = ['ticker', 'name', 'filing', 'url', 'allocation'];
const OPTIONAL = ['closed', 'upcoming']; // Only written when true. A key that is not there means false.
const isUrl = (value) => typeof value === 'string' && /^https:\/\/\S+$/.test(value);
const label = (etf) => etf.ticker || etf.name;

test('etf.json is a list of funds', () => {
  assert.ok(Array.isArray(etfs) && etfs.length > 0);
});

test('each fund has the schema keys only (no leverage, no AUM)', () => {
  for (const etf of etfs) {
    const keys = Object.keys(etf);
    for (const key of REQUIRED) assert.ok(keys.includes(key), `${label(etf)}: ${key} is required`);
    for (const key of keys) assert.ok(REQUIRED.includes(key) || OPTIONAL.includes(key), `${label(etf)}: ${key} is not in the schema`);
  }
});

test('each fund has correct field types', () => {
  for (const etf of etfs) {
    const id = label(etf);
    assert.ok(typeof etf.name === 'string' && etf.name.trim() === etf.name && etf.name, `${id}: name`);
    for (const key of OPTIONAL) if (key in etf) assert.equal(etf[key], true, `${id}: write ${key} only when it is true`);
    assert.ok(!(etf.closed && etf.upcoming), `${id}: closed and upcoming at the same time`);
    assert.ok(isUrl(etf.url), `${id}: url`);
    assert.ok(isUrl(etf.filing) && new URL(etf.filing).hostname.endsWith('sec.gov'), `${id}: filing must be on sec.gov`);
    // Only a fund that is not trading yet can be without a ticker.
    assert.ok('ticker' in etf, `${id}: ticker is required, null when there is none yet`);
    if (etf.ticker === null) assert.ok(etf.upcoming, `${id}: only an upcoming fund can have a null ticker`);
    else assert.match(etf.ticker, /^[A-Z]{2,5}$/, `${id}: ticker`);
  }
});

test('each allocation has parts with a positive pct and a what', () => {
  for (const etf of etfs) {
    const id = label(etf);
    assert.ok(Array.isArray(etf.allocation) && etf.allocation.length >= 2, `${id}: a stacked fund has 2 parts or more`);
    for (const part of etf.allocation) {
      assert.deepEqual(Object.keys(part).sort(), ['pct', 'what'], `${id}: allocation keys`);
      assert.ok(typeof part.pct === 'number' && part.pct > 0 && part.pct <= 300, `${id}: pct`);
      assert.ok(typeof part.what === 'string' && part.what && part.what.trim() === part.what, `${id}: what`);
    }
    const whats = etf.allocation.map((part) => part.what);
    assert.equal(new Set(whats).size, whats.length, `${id}: the same what is there two times`);
    assert.ok(PA.leverage(etf) > 1, `${id}: the allocation must add to more than 100%`);
  }
});

test('each allocation is in order: largest pct first, then by what', () => {
  for (const etf of etfs) {
    const sorted = [...etf.allocation].sort((a, b) => b.pct - a.pct || (a.what < b.what ? -1 : 1));
    assert.deepEqual(etf.allocation, sorted, label(etf));
  }
});

test('tickers and names are unique', () => {
  const tickers = etfs.map((etf) => etf.ticker).filter(Boolean);
  assert.equal(new Set(tickers).size, tickers.length);
  const names = etfs.map((etf) => etf.name);
  assert.equal(new Set(names).size, names.length);
});

test('names do not end with "ETF" or "Fund": each entry is an ETF', () => {
  for (const etf of etfs) assert.doesNotMatch(etf.name, /\b(ETF|Fund|Exchange[- ]Traded Fund)$/i, label(etf));
});

test('etf.json is in alphabetical order: tickers first, then funds with no ticker by name', () => {
  const key = (etf) => `${etf.ticker ? 0 : 1}${etf.ticker || etf.name}`;
  const keys = etfs.map(key);
  assert.deepEqual(keys, [...keys].sort());
});

test('each fund goes into one of the 4 categories', () => {
  for (const etf of etfs) assert.ok(PA.CATEGORIES.includes(PA.categoryOf(etf)), label(etf));
});

test('categories come from the allocation', () => {
  const fund = (...parts) => ({ allocation: parts.map(([pct, what]) => ({ pct, what })) });
  assert.equal(PA.categoryOf(fund([90, 'SPY'], [90, 'Gold'])), PA.CATEGORIES[0]);
  assert.equal(PA.categoryOf(fund([90, 'SPY'], [60, 'GOVT'])), PA.CATEGORIES[1]);
  assert.equal(PA.categoryOf(fund([100, 'SPY'], [100, 'MF'])), PA.CATEGORIES[2]);
  assert.equal(PA.categoryOf(fund([100, 'GOVT'], [100, 'Carry'])), PA.CATEGORIES[2]);
  assert.equal(PA.categoryOf(fund([100, 'SPY'], [80, 'Gold'], [20, 'BTC'])), PA.CATEGORIES[3]);
});

test('portfolio exposure: 40% RSSX + 30% RSBT + 30% AVUV', () => {
  const list = [
    { ticker: 'RSSX', allocation: [{ pct: 100, what: 'SPY' }, { pct: 80, what: 'Gold' }, { pct: 20, what: 'BTC' }] },
    { ticker: 'RSBT', allocation: [{ pct: 100, what: 'GOVT' }, { pct: 100, what: 'MF' }] },
  ];
  const result = PA.exposures(PA.decodePortfolio('RSSX:40,RSBT:30,AVUV:30'), list);
  const byWhat = Object.fromEntries(result.rows.map((row) => [row.what, row.pct]));
  assert.deepEqual(byWhat, { SPY: 40, Gold: 32, GOVT: 30, MF: 30, AVUV: 30, BTC: 8 });
  assert.equal(result.total, 170);
  assert.equal(result.leverage, 1.7);
  const normalized = result.rows.reduce((sum, row) => sum + row.normalized, 0);
  assert.ok(Math.abs(normalized - 100) < 1e-9);
});

test('exposure rows are grouped by color, and sorted by size within a color', () => {
  const list = [
    { ticker: 'AAA', allocation: [{ pct: 10, what: 'BIL' }, { pct: 50, what: 'GOVT' }, { pct: 20, what: 'Gold' }, { pct: 30, what: 'CTA' }] },
    { ticker: 'BBB', allocation: [{ pct: 5, what: 'SPY' }, { pct: 40, what: 'AVUV' }, { pct: 15, what: 'MF' }, { pct: 25, what: 'AHLT' }, { pct: 60, what: 'BTC' }] },
  ];
  const result = PA.exposures([{ ticker: 'AAA', weight: 40 }, { ticker: 'BBB', weight: 40 }, { ticker: 'ZZZZ', weight: 20 }], list);
  assert.deepEqual(Array.from(result.rows, (row) => row.what), ['SPY', 'AVUV', 'AHLT', 'MF', 'BTC', 'CTA', 'Gold', 'GOVT', 'BIL', 'ZZZZ']);
  for (const [, color] of Object.values(PA.WHAT)) assert.ok(PA.COLOR_ORDER.includes(color), color);
});

test('a fund that has no ticker gets a TBD symbol that works in a portfolio', () => {
  const list = PA.withSymbols([
    { ticker: 'AAA', allocation: [{ pct: 100, what: 'SPY' }, { pct: 100, what: 'MF' }] },
    { ticker: null, allocation: [{ pct: 100, what: 'VT' }, { pct: 100, what: 'Bonds' }] },
  ]);
  assert.deepEqual(list.map((etf) => etf.symbol), ['AAA', 'TBD-2']);
  const result = PA.exposures(PA.decodePortfolio('TBD-2:50'), list);
  assert.deepEqual(Object.fromEntries(result.rows.map((row) => [row.what, row.pct])), { VT: 50, Bonds: 50 });
});

test('the default portfolio is 20% each of 5 funds, and its listed funds are in etf.json', () => {
  assert.equal(PA.encodePortfolio(PA.DEFAULT_PORTFOLIO), 'RSSX:20,RSBT:20,WTLS:20,GMIX:20,AVUV:20');
  const tickers = new Set(etfs.map((etf) => etf.ticker));
  for (const ticker of ['RSSX', 'RSBT', 'WTLS', 'GMIX']) assert.ok(tickers.has(ticker), ticker);
  const result = PA.exposures(PA.DEFAULT_PORTFOLIO, PA.withSymbols(etfs));
  assert.equal(result.weight, 100);
});

test('a ticker that is not known gets the gray "other" color', () => {
  assert.equal(PA.colorOf('ZZZZ'), 'other');
  assert.equal(PA.hoverText('ZZZZ'), 'ZZZZ');
});

test('search looks at all columns', () => {
  const etf = { ticker: 'RSST', name: 'Return Stacked U.S. Stocks & Managed Futures ETF', closed: false, upcoming: false,
    allocation: [{ pct: 100, what: 'SPY' }, { pct: 100, what: 'MF' }] };
  for (const query of ['rsst', 'stacked', '100% spy', 'managed futures', 's&p rsst', ''])
    assert.ok(PA.matches(etf, query), query);
  for (const query of ['gold', 'closed', 'rsst bitcoin']) assert.ok(!PA.matches(etf, query), query);
});

test('the portfolio survives the URL', () => {
  const text = 'RSSX:40,RSBT:30,AVUV:30';
  assert.equal(PA.encodePortfolio(PA.decodePortfolio(text)), text);
  assert.equal(PA.decodePortfolio(''), null);
});

test('the build writes etf.json into the page', () => {
  execFileSync(process.execPath, [fileURLToPath(new URL('build.mjs', root))]);
  const built = readFileSync(new URL('_site/index.html', root), 'utf8');
  const baked = built.match(/<script id="etfs" type="application\/json">([\s\S]*?)<\/script>/)[1];
  assert.equal(JSON.stringify(JSON.parse(baked)), JSON.stringify(etfs));
  assert.ok(!/fetch\(/.test(built), 'the page does not fetch its data');
});
