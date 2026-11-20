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
// closed and upcoming are only written when true; a key that is not there means false. aum.mjs writes aum.
const OPTIONAL = ['closed', 'upcoming', 'aum'];
const isUrl = (value) => typeof value === 'string' && /^https:\/\/\S+$/.test(value);
const label = (etf) => etf.ticker || etf.name;

test('etf.json is a list of funds', () => {
  assert.ok(Array.isArray(etfs) && etfs.length > 0);
});

test('aum is an amount in USD and the date of the check, for trading funds only', () => {
  for (const etf of etfs.filter((etf) => 'aum' in etf)) {
    const id = label(etf);
    assert.ok(!etf.closed && !etf.upcoming && etf.ticker, `${id}: only a trading fund has aum`);
    assert.deepEqual(Object.keys(etf.aum), ['amount', 'last_checked'], `${id}: aum keys`);
    assert.ok(Number.isInteger(etf.aum.amount) && etf.aum.amount > 0, `${id}: aum.amount is a positive integer`);
    const date = etf.aum.last_checked;
    assert.match(date, /^\d{4}-\d{2}-\d{2}$/, `${id}: aum.last_checked is YYYY-MM-DD`);
    assert.equal(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10), date, `${id}: aum.last_checked is a real date`);
  }
});

test('each fund has the schema keys only (no leverage)', () => {
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
    for (const key of ['closed', 'upcoming']) if (key in etf) assert.equal(etf[key], true, `${id}: write ${key} only when it is true`);
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

test('each allocation is in order: largest pct first, then by asset class, then by what', () => {
  for (const etf of etfs) {
    assert.deepEqual(etf.allocation, [...etf.allocation].sort(PA.compareParts), label(etf));
  }
});

test('parts with the same pct go equities, bonds, commodities, managed futures, crypto', () => {
  const parts = ['BTC', 'MF', 'Gold', 'GOVT', 'L/S', 'IJR', 'VT', 'SPY', 'ZZZZ', 'QQQ'].map((what) => ({ pct: 50, what }));
  parts.push({ pct: 60, what: 'ETH' });
  assert.deepEqual(parts.sort(PA.compareParts).map((part) => part.what),
    ['ETH', 'QQQ', 'SPY', 'VT', 'IJR', 'L/S', 'GOVT', 'Gold', 'MF', 'BTC', 'ZZZZ']);
  assert.deepEqual([...PA.TIE_ORDER].sort(), [...PA.COLOR_ORDER].sort());
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
    { ticker: 'BBB', allocation: [{ pct: 5, what: 'SPY' }, { pct: 40, what: 'IJR' }, { pct: 15, what: 'MF' }, { pct: 25, what: 'AHLT' }, { pct: 60, what: 'BTC' }] },
  ];
  const result = PA.exposures([{ ticker: 'AAA', weight: 40 }, { ticker: 'BBB', weight: 40 }, { ticker: 'ZZZZ', weight: 20 }], list);
  assert.deepEqual(Array.from(result.rows, (row) => row.what), ['SPY', 'IJR', 'AHLT', 'MF', 'BTC', 'CTA', 'Gold', 'GOVT', 'BIL', 'ZZZZ']);
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
  // AVUV is not in etf.json and no fund holds it, so it is gray until the user picks its asset class.
  const avuv = result.rows.find((row) => row.what === 'AVUV');
  assert.deepEqual([avuv.color, avuv.pickable], ['other', true]);
});

test('WHAT has only what a fund holds: no other ticker has a color of its own', () => {
  const held = new Set(etfs.flatMap((etf) => etf.allocation.map((part) => part.what)));
  for (const what of Object.keys(PA.WHAT)) assert.ok(held.has(what), `${what} is in WHAT, but no fund in etf.json holds it`);
  for (const what of held) assert.ok(Object.hasOwn(PA.WHAT, what), `${what} is not in WHAT`);
});

test('a ticker that is not known gets the gray "other" color', () => {
  assert.equal(PA.colorOf('ZZZZ'), 'other');
  assert.equal(PA.hoverText('ZZZZ'), 'ZZZZ');
});

test('a picked asset class gives a ticker that is not known its color and its place in the order', () => {
  const list = [{ ticker: 'AAA', allocation: [{ pct: 100, what: 'SPY' }, { pct: 100, what: 'GOVT' }] }];
  const rows = (text) => Array.from(PA.exposures(PA.decodePortfolio(text), list).rows, (row) => [row.what, row.color, row.pickable]);
  assert.deepEqual(rows('AAA:50,IBIT:25,VTI:25'), [['SPY', 'large', false], ['GOVT', 'bond', false], ['IBIT', 'other', true], ['VTI', 'other', true]]);
  assert.deepEqual(rows('AAA:50,IBIT:25:crypto,VTI:25:large'), [['SPY', 'large', false], ['VTI', 'large', true], ['IBIT', 'crypto', true], ['GOVT', 'bond', false]]);
  // A ticker that WHAT knows, and a fund in the list, keep their own colors.
  assert.deepEqual(rows('AAA:50:crypto,IJR:50:bond'), [['SPY', 'large', false], ['IJR', 'small', false], ['GOVT', 'bond', false]]);
  // Two holdings of the same ticker are one row, with the class that was picked.
  assert.deepEqual(rows('IBIT:50,IBIT:50:crypto'), [['IBIT', 'crypto', true]]);
  assert.deepEqual(Object.keys(PA.CLASS_NAME).sort(), [...PA.COLOR_ORDER].sort());
});

test('a picked asset class survives the URL, and one that is not known is dropped', () => {
  const text = 'RSSX:40,IBIT:30:crypto,VTI:30:large';
  assert.equal(PA.encodePortfolio(PA.decodePortfolio(text)), text);
  for (const bad of ['IBIT:30:other', 'IBIT:30:pink', 'IBIT:30:constructor', 'IBIT:30:'])
    assert.equal(PA.encodePortfolio(PA.decodePortfolio(bad)), 'IBIT:30', bad);
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

test('AUM shows in whole millions', () => {
  assert.equal(PA.formatAum(65420000), '65');
  assert.equal(PA.formatAum(1828178690), '1,828');
  assert.equal(PA.formatAum(500000), '1');
  assert.equal(PA.formatAum(491073), '<1');
});

test('rows sort by AUM, largest first, and funds with no AUM stay last in their order', () => {
  const funds = [{ t: 'A' }, { t: 'B', aum: { amount: 5 } }, { t: 'C' }, { t: 'D', aum: { amount: 9 } }];
  assert.equal(funds.sort(PA.byAum).map((f) => f.t).join(''), 'DBAC');
});
