// Builds _site/index.html: index.html with etf.json written into its <script id="etfs"> block.
//   node build.mjs               build once
//   node build.mjs --dev [port]  build, serve _site, and rebuild when index.html or etf.json changes
import { mkdirSync, readFileSync, watch, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';

const root = new URL('./', import.meta.url);
const out = new URL('_site/', root);
const SLOT = /(<script id="etfs" type="application\/json">)[\s\S]*?(<\/script>)/;

let last;

// Returns the number of funds, or null when the sources have not changed since the last build.
function build() {
  const page = readFileSync(new URL('index.html', root), 'utf8');
  const json = readFileSync(new URL('etf.json', root), 'utf8');
  if (page + json === last) return null;
  if (!SLOT.test(page)) throw new Error('index.html has no <script id="etfs" type="application/json"> block');
  const etfs = JSON.parse(json);
  // "<" is escaped so that no fund name can end the script block.
  const data = JSON.stringify(etfs).replace(/</g, '\\u003c');
  mkdirSync(out, { recursive: true });
  writeFileSync(new URL('index.html', out), page.replace(SLOT, (_, open, close) => open + data + close));
  writeFileSync(new URL('etf.json', out), json);
  last = page + json;
  return etfs.length;
}

const dev = process.argv.indexOf('--dev');
if (dev === -1) {
  console.log(`_site/index.html: ${build()} funds`);
} else {
  const port = Number(process.argv[dev + 1]) || 8000;
  const rebuild = () => {
    try {
      const funds = build();
      if (funds !== null) console.log(`${new Date().toLocaleTimeString()} built, ${funds} funds`);
    } catch (error) {
      console.error(`build failed: ${error.message}`);
    }
  };
  rebuild();
  let timer;
  // Watch the folder, not the two files: an editor that saves by rename would end a watch on the file.
  watch(root, (event, file) => {
    if (file !== 'index.html' && file !== 'etf.json') return;
    clearTimeout(timer);
    timer = setTimeout(rebuild, 50);
  });
  const types = { '/index.html': 'text/html; charset=utf-8', '/etf.json': 'application/json' };
  createServer((request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname.replace(/\/$/, '/index.html');
    if (!types[path]) return response.writeHead(404).end('Not found');
    response.writeHead(200, { 'Content-Type': types[path], 'Cache-Control': 'no-store' });
    response.end(readFileSync(new URL(path.slice(1), out)));
  }).listen(port, () => console.log(`http://localhost:${port}/`));
}
