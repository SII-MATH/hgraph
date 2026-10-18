/** Reproducible static-export lifecycle checks. Build first; no production server. */
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const webui = join(repo, 'hgraph/webui');
const prefix = '/proxy/18726/';
const root = await mkdtemp(join(tmpdir(), 'hgraph-lifecycle-'));
await cp(webui, root, { recursive: true });
const requests = [];
const outsidePrefix = [];
const json = (path, data) => writeFile(path, JSON.stringify(data));
const statuses = ['mathlib_ok', 'lean_ok', 'sorry', 'empty'];
const entries = Array.from({ length: 16 }, (_, index) => ({
  id: `node-${index + 1}`, label: `test:node-${index + 1}`, title: `Lifecycle result ${index + 1}`,
  chapter: index < 8 ? 'First chapter' : 'Second chapter', kind: index === 0 ? 'definition' : 'theorem',
  body: 'The class $h_i\\in E_2^{1,2^i}$ lies over $\\F_2$. \\[d_r^2=0.\\] ' +
    'The coefficient tower and its common cycle representatives determine this filtration. '.repeat(10),
  lean_status: statuses[index % statuses.length], mathlib_name: null, status: null, tags: [],
  lean: [], deps: index ? [{ id: `node-${index}`, label: `test:node-${index}`, title: `Lifecycle result ${index}`, type: 'uses' }] : [],
  reviewed: false, maths_verdict: null, lean_verdict: null, reviews: [], comments: [],
  sketch: index === 2, level: index % 3 === 0 ? 'coarse' : 'fine',
}));
const refs = Object.fromEntries(entries.map((entry, index) => [entry.label,
  { num: `${Math.floor(index / 8) + 1}.${index % 8 + 1}`, id: entry.id, abbr: index ? 'Thm' : 'Def', kind: 'stmt', ch: Math.floor(index / 8), anchor: `stmt-${entry.id}` }]));
const chapters = [0, 1].map((chapter) => ({
  title: chapter ? 'Second chapter' : 'First chapter', num: String(chapter + 1),
  blocks: [{ t: 'head', level: 2, title: 'Coefficient towers', num: `${chapter + 1}.1` },
    ...entries.slice(chapter * 8, chapter * 8 + 8).map((entry, index) => ({
      t: 'stmt', id: entry.id, label: entry.label, labels: [entry.label], title: entry.title,
      content_type: entry.kind, lean: [], uses: entry.deps.map((dep) => dep.label),
      leanok: entry.lean_status === 'lean_ok', mathlibok: entry.lean_status === 'mathlib_ok',
      body: entry.body, num: `${chapter + 1}.${index + 1}`, abbr: entry.kind === 'definition' ? 'Def' : 'Thm', enrich: entry,
    }))],
}));
const tabs = [
  { id: 'inline-modal', label: 'Inline tool', presentation: 'modal', html: '<h2>Inline lifecycle tool</h2><p>$x^2=1$</p><script>window.inlineScriptExecuted = true;</script><button data-hgraph-close>Finish inline</button>' },
  { id: 'iframe-modal', label: 'Iframe tool', presentation: 'modal', html: '<iframe title="SDK tool" src="widgets/tool.html" style="width:100%;height:400px"></iframe>' },
  { id: 'default-page', label: 'Default page', html: '<h2>Default page content</h2><button data-hgraph-close>Finish page</button>' },
];
const workspace = {
  title: 'Lifecycle workspace',
  sections: [{ category: 'Fixture projects', projects: [{ name: 'Lifecycle fixture', root: 'enabled',
    category: 'Fixture', stats: { statements: entries.length, done: 8, partial: 0, todo: 8, pct: 50 } }] }],
  tabs: [
    { id: 'workspace-modal', label: 'Workspace tool', presentation: 'modal',
      html: '<h2>Workspace modal content</h2><button data-hgraph-close>Finish workspace modal</button>' },
    { id: 'workspace-page', label: 'Workspace page',
      html: '<h2>Workspace page content</h2><button data-hgraph-close>Finish workspace page</button>' },
  ],
};
const indexPath = join(root, 'index.html');
const indexHtml = await readFile(indexPath, 'utf8');
await writeFile(indexPath, indexHtml.replace('</head>',
  `<script>window.__HGRAPH_DATA__=${JSON.stringify(workspace).replace(/</g, '\\u003c')}</script></head>`));
const project = {
  title: 'Lifecycle fixture', docTitle: 'Lifecycle fixture', mode: 'doc', entries, chapters, refs,
  loc: Object.fromEntries(entries.map((entry, index) => [entry.id, Math.floor(index / 8)])),
  macros: { '\\F': '\\mathbb{F}' }, bib: [], repo: null, customTabs: tabs,
};
for (const name of ['enabled', 'disabled']) {
  await mkdir(join(root, name), { recursive: true });
  const data = name === 'enabled' ? { ...project, map: { enabled: true, label: 'Blueprint map' } } : project;
  await json(join(root, name, 'project.json'), data);
  await json(join(root, name, 'data.json'), data);
}
await mkdir(join(root, 'widgets'), { recursive: true });
await writeFile(join(root, 'widgets/tool.html'), `<!doctype html><html><head><meta charset="utf-8"><script src="../hgraph-custom-page.js"></script></head><body>
<h1>Iframe lifecycle tool</h1><button id="sdk-close" onclick="window.hgraph.close()">SDK Close</button>
<button id="sdk-navigate" onclick="window.hgraph.navigate('test:node-2')">SDK Navigate</button>
<script>window.hgraph.ready();</script></body></html>`);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://fixture').pathname;
  requests.push(path);
  if (!path.startsWith(prefix)) {
    outsidePrefix.push(path); response.writeHead(404); response.end('Outside fixture prefix'); return;
  }
  const relative = decodeURIComponent(path.slice(prefix.length)) || 'index.html';
  const file = resolve(root, relative);
  if (file !== root && !file.startsWith(root + sep)) { response.writeHead(403); response.end(); return; }
  try {
    if (!(await stat(file)).isFile()) throw new Error('Not a file');
    response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(await readFile(file));
  } catch { response.writeHead(404); response.end('Fixture file not found'); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}${prefix}`;
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',
  args: ['--no-sandbox'] });
after(async () => {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(root, { recursive: true, force: true });
});

const nav = (page, text) => page.locator('#blueprint-navigation .navlink').filter({ hasText: text });
const pause = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(check, message, timeout = 10000) {
  const end = Date.now() + timeout;
  do { if (await check()) return; await pause(30); } while (Date.now() < end);
  assert.fail(message);
}
let readerRun = 0;
async function reader(page, query = 'Lifecycle') {
  // Independent fixture runs need a document navigation, rather than an SPA-only hash change.
  await page.goto(`${base}?fixture=${++readerRun}#/enabled#test:node-1`);
  await page.locator('#stmt-node-1.sel').waitFor();
  await page.locator('.navq').fill(query);
  await waitFor(async () => await page.locator('.doc-main .stmt').count() === entries.length, 'Search results did not settle');
  await page.evaluate(() => {
    window.scrollTo(0, 500);
    window.readerMarker = document.querySelector('.doc-main');
    window.readerQueryMarker = document.querySelector('.navq');
    window.lifecycleLoadToken = crypto.randomUUID();
  });
  await pause();
  return page.evaluate(() => ({ token: window.lifecycleLoadToken, y: scrollY, selected: document.querySelector('.stmt.sel')?.id, query: document.querySelector('.navq').value }));
}
async function unchanged(page, previous) {
  await waitFor(async () => await page.locator('.content-modal').count() === 0, 'Overlay remained open');
  const state = await page.evaluate(() => ({ token: window.lifecycleLoadToken, y: scrollY,
    selected: document.querySelector('.stmt.sel')?.id, query: document.querySelector('.navq').value,
    sameReader: window.readerMarker === document.querySelector('.doc-main'),
    sameQuery: window.readerQueryMarker === document.querySelector('.navq') }));
  assert.equal(state.token, previous.token, 'Page reloaded');
  assert.equal(state.selected, previous.selected, 'Reader selection changed');
  assert.equal(state.query, previous.query, 'Reader query changed');
  assert.ok(Math.abs(state.y - previous.y) < 3, `Reader scroll changed: ${previous.y} → ${state.y}`);
  assert.ok(state.sameReader && state.sameQuery, 'Underlying reader DOM was replaced');
}
async function mapFrame(page) {
  await nav(page, 'Blueprint map').click();
  const handle = await page.locator('iframe.native-map-frame').elementHandle();
  const frame = await handle.contentFrame();
  await frame.locator('.node-card').first().waitFor();
  return frame;
}
async function rejectMessages(page, frame, openSelector) {
  await page.evaluate(() => {
    const data = { channel: 'hgraph:custom-page', version: 1, type: 'close' };
    // Correct origin, but parent-window source, not the hosted iframe.
    window.postMessage(data, location.origin);
    const active = document.querySelector('iframe.native-map-frame, .content-modal iframe');
    window.dispatchEvent(new MessageEvent('message', { origin: 'https://wrong-origin.invalid', source: active.contentWindow, data }));
    window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: active.contentWindow, data: { ...data, version: 2 } }));
    const unrelated = document.createElement('iframe'); unrelated.id = 'unrelated-frame';
    document.body.append(unrelated);
    window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: unrelated.contentWindow, data }));
  });
  await pause();
  assert.equal(await page.locator(openSelector).count(), 1, 'Unauthorised message closed the overlay');
  assert.equal(await frame.evaluate(() => window.hgraph.version), 1);
  await page.locator('#unrelated-frame').evaluate((element) => element.remove());
}

await test('static lifecycle under a preserved /proxy/PORT/ prefix', async (t) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await t.test('Map remains absent unless the project opts in', async () => {
    await page.goto(`${base}#/disabled`);
    await page.locator('.project-header').waitFor();
    assert.equal(await nav(page, 'Blueprint map').count(), 0);
    assert.equal(await page.locator('iframe.native-map-frame').count(), 0);
  });
  await t.test('native Map receives every node, preserves statuses, and renders local math', async () => {
    const state = await reader(page);
    const frame = await mapFrame(page);
    assert.equal(await frame.locator('.node-card').count(), entries.length);
    const cards = await frame.locator('.node-card').evaluateAll((elements) => elements.map((element) => ({ id: element.dataset.node, status: element.dataset.status })));
    assert.deepEqual(cards, entries.map((entry) => ({ id: entry.id, status: entry.lean_status })));
    const zoom = await frame.locator('#map-zoom-level').textContent();
    await frame.locator('#map-zoom-in').click();
    assert.notEqual(await frame.locator('#map-zoom-level').textContent(), zoom);
    await frame.locator('#map-fit').click();
    await frame.locator('[data-node="node-3"] .node-preview-toggle').click({ force: true });
    await frame.locator('#detail-body .katex').first().waitFor();
    assert.equal(await frame.locator('.katex-error').count(), 0);
    assert.match(await frame.locator('#detail-status').textContent(), /sketch/);
    await frame.locator('#map-close').click();
    await unchanged(page, state);
  });
  await t.test('Map Escape closes preview, clears focus, then closes without reloading', async () => {
    const state = await reader(page);
    const frame = await mapFrame(page);
    await frame.locator('[data-node="node-2"]').click({ force: true });
    await frame.locator('[data-node="node-2"] .node-preview-toggle').click({ force: true });
    await frame.locator('#map-search').focus();
    await frame.press('#map-search', 'Escape');
    assert.equal(await frame.locator('#detail-panel.open').count(), 0);
    assert.equal(await frame.locator('.node-card.selected').count(), 1);
    await frame.press('#map-search', 'Escape');
    assert.equal(await frame.locator('.node-card.selected').count(), 0);
    await frame.press('#map-search', 'Escape');
    await unchanged(page, state);
    await mapFrame(page);
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    await unchanged(page, state);
  });
  await t.test('Map protocol rejects wrong origin, version, and iframe source', async () => {
    const state = await reader(page);
    const frame = await mapFrame(page);
    await rejectMessages(page, frame, 'iframe.native-map-frame');
    await frame.evaluate(() => window.hgraph.navigate('test:unknown'));
    await pause();
    assert.equal(await page.locator('iframe.native-map-frame').count(), 1, 'Unknown locator closed Map');
    await frame.evaluate(() => window.hgraph.close());
    await unchanged(page, state);
  });
  await t.test('Map Blueprint links navigate through the SDK without reloading', async () => {
    const state = await reader(page);
    const frame = await mapFrame(page);
    await frame.locator('[data-node="node-2"] .node-preview-toggle').click({ force: true });
    await frame.getByRole('link', { name: 'Open in Blueprint', exact: false }).click({ force: true });
    await page.locator('#stmt-node-2.sel').waitFor();
    assert.equal(await page.locator('.content-modal').count(), 0);
    assert.equal(await page.evaluate(() => window.lifecycleLoadToken), state.token);
  });
  await t.test('inline modal close button, event, and host SDK preserve the reader', async () => {
    const state = await reader(page);
    for (const close of ['button', 'event', 'sdk']) {
      await nav(page, 'Inline tool').click();
      await page.getByRole('dialog', { name: 'Inline tool', exact: true }).waitFor();
      assert.equal(await page.evaluate(() => window.inlineScriptExecuted), undefined, 'Injected script unexpectedly executed');
      if (close === 'button') await page.getByRole('button', { name: 'Finish inline', exact: true }).click();
      if (close === 'event') await page.evaluate(() => window.dispatchEvent(new CustomEvent('hgraph:close')));
      if (close === 'sdk') await page.evaluate(() => window.hgraph.close());
      await unchanged(page, state);
    }
  });
  await t.test('custom iframe SDK validates source and supports close and navigation', async () => {
    const state = await reader(page);
    await nav(page, 'Iframe tool').click();
    const frame = await (await page.getByTitle('SDK tool', { exact: true }).elementHandle()).contentFrame();
    await frame.locator('#sdk-close').waitFor();
    await rejectMessages(page, frame, '[role="dialog"][aria-label="Iframe tool"]');
    await frame.evaluate(() => window.hgraph.navigate('test:unknown'));
    await pause();
    assert.equal(await page.getByRole('dialog', { name: 'Iframe tool', exact: true }).count(), 1, 'Unknown locator closed custom modal');
    // A tool can consume Escape before the SDK's window listener.
    await frame.evaluate(() => document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') event.preventDefault();
    }, { once: true }));
    await frame.press('#sdk-close', 'Escape');
    assert.equal(await page.getByRole('dialog', { name: 'Iframe tool', exact: true }).count(), 1);
    await frame.locator('#sdk-close').click();
    await unchanged(page, state);
    await nav(page, 'Iframe tool').click();
    const escapable = await (await page.getByTitle('SDK tool', { exact: true }).elementHandle()).contentFrame();
    await escapable.locator('#sdk-close').waitFor();
    await escapable.press('#sdk-close', 'Escape');
    await unchanged(page, state);
    await nav(page, 'Iframe tool').click();
    const next = await (await page.getByTitle('SDK tool', { exact: true }).elementHandle()).contentFrame();
    await next.locator('#sdk-navigate').click();
    await page.locator('#stmt-node-2.sel').waitFor();
    assert.equal(await page.locator('.content-modal').count(), 0);
    assert.equal(await page.evaluate(() => window.lifecycleLoadToken), state.token);
  });
  await t.test('default custom pages return to their previous view on close', async () => {
    const state = await reader(page);
    await nav(page, 'Default page').click();
    await page.getByRole('heading', { name: 'Default page content', exact: true }).waitFor();
    assert.equal(await page.locator('.content-modal').count(), 0, 'Default page became a modal');
    await page.getByRole('button', { name: 'Finish page', exact: true }).click();
    await page.locator('#stmt-node-1.sel').waitFor();
    assert.equal(await page.locator('.navq').inputValue(), state.query);
    assert.equal(await page.evaluate(() => window.lifecycleLoadToken), state.token);
    await waitFor(async () => await page.evaluate((y) => Math.abs(scrollY - y) < 3, state.y), 'Default page did not restore reader scroll');
  });
  await t.test('closing a modal above a custom page leaves that page active', async () => {
    const state = await reader(page);
    await nav(page, 'Default page').click();
    await page.getByRole('heading', { name: 'Default page content', exact: true }).waitFor();
    await nav(page, 'Inline tool').click();
    await page.getByRole('dialog', { name: 'Inline tool', exact: true }).waitFor();
    await page.evaluate(() => window.hgraph.close());
    await waitFor(async () => await page.locator('.content-modal').count() === 0, 'Nested modal remained open');
    assert.equal(await page.getByRole('heading', { name: 'Default page content', exact: true }).count(), 1,
      'A modal close event also closed the underlying custom page');
    assert.ok(await nav(page, 'Default page').evaluate((element) => element.classList.contains('on')));
    assert.equal(await page.evaluate(() => window.lifecycleLoadToken), state.token);
    await page.getByRole('button', { name: 'Finish page', exact: true }).click();
    await page.locator('#stmt-node-1.sel').waitFor();
  });
  await t.test('workspace custom modal/page lifecycles return to Projects without reload', async () => {
    await page.goto(`${base}?workspace=1#/`);
    await page.locator('.card-grid').waitFor();
    const landingNav = (text) => page.locator('.landing-tab').filter({ hasText: text });
    const token = await page.evaluate(() => {
      window.workspaceToken = crypto.randomUUID();
      window.workspaceCards = document.querySelector('.card-grid');
      return window.workspaceToken;
    });
    await landingNav('Workspace tool').click();
    await page.getByRole('dialog', { name: 'Workspace tool', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Finish workspace modal', exact: true }).click();
    await waitFor(async () => await page.locator('.content-modal').count() === 0, 'Workspace modal remained open');
    assert.ok(await page.evaluate(() => window.workspaceCards === document.querySelector('.card-grid')),
      'Workspace modal replaced the Projects DOM');
    await landingNav('Workspace page').click();
    await page.getByRole('heading', { name: 'Workspace page content', exact: true }).waitFor();
    assert.equal(await page.locator('.content-modal').count(), 0);
    // Exercise the same covered-page case on the workspace.
    await landingNav('Workspace tool').click();
    await page.getByRole('dialog', { name: 'Workspace tool', exact: true }).waitFor();
    await page.evaluate(() => window.hgraph.close());
    await waitFor(async () => await page.locator('.content-modal').count() === 0, 'Workspace modal remained open');
    assert.equal(await page.getByRole('heading', { name: 'Workspace page content', exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Finish workspace page', exact: true }).click();
    await page.locator('.card-grid').waitFor();
    assert.ok(await landingNav('Projects').evaluate((element) => element.classList.contains('on')));
    assert.equal(await page.evaluate(() => window.workspaceToken), token, 'Workspace reloaded');
  });
  await t.test('native Graph still lays out, filters, and closes over the same reader', async () => {
    const state = await reader(page);
    await nav(page, 'Dependency graph').click();
    await page.locator('.gv-inner svg').waitFor({ timeout: 20000 });
    await page.locator('.gm-q').fill('Lifecycle result 2');
    assert.equal(await page.locator('.gm-q').inputValue(), 'Lifecycle result 2');
    await page.getByRole('button', { name: /Close/ }).filter({ hasText: 'Close' }).last().click();
    await waitFor(async () => await page.locator('.graph-modal').count() === 0, 'Graph did not close');
    await unchanged(page, state);
  });
  await t.test('all asset/API paths stay under the prefix and Map uses no sidecar data', async () => {
    assert.deepEqual(outsidePrefix.filter((path) => path !== '/favicon.ico'), []);
    assert.ok(requests.some((path) => path === prefix + 'blueprint-map/renderer.html'));
    assert.ok(requests.some((path) => path === prefix + 'hgraph-custom-page.js'));
    assert.ok(!requests.some((path) => path.endsWith('blueprint-map/data.json')), 'Native Map fetched a sidecar data.json');
    assert.deepEqual(errors, [], 'Browser runtime errors');
  });
  await page.close();
});
