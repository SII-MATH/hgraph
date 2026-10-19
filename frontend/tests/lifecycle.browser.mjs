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
  { id: 'cached-iframe', label: 'Cached iframe', html: '<iframe title="Cached tool" src="widgets/tool.html" style="width:100%;height:400px"></iframe>' },
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
for (const name of ['enabled', 'disabled', 'cache-fixture']) {
  await mkdir(join(root, name), { recursive: true });
  const data = name === 'disabled' ? project : { ...project, map: { enabled: true, label: 'Blueprint map' } };
  if (name === 'cache-fixture') data.customTabs = [...tabs, ...Array.from({length:7}, (_,i)=>({id:'extra-'+i,label:'Extra '+i,html:'<h2>Extra '+i+'</h2>'}))];
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
async function reader(page, query = 'Lifecycle', projectRoot = 'enabled') {
  // Independent fixture runs need a document navigation, rather than an SPA-only hash change.
  await page.goto(`${base}?fixture=${++readerRun}#/${projectRoot}#test:node-1`);
  await page.locator('#stmt-node-1.sel:visible').waitFor();
  await page.locator('.navq').fill(query);
  await waitFor(async () => await page.locator('.doc-main .stmt:visible').count() === (query ? entries.length : 8), 'Search results did not settle');
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
  await waitFor(async () => await page.locator('.content-modal:visible').count() === 0, 'Overlay remained open');
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
  const handle = await page.locator('iframe.native-map-frame:visible').elementHandle();
  const frame = await handle.contentFrame();
  await frame.locator('.node-card').first().waitFor();
  return frame;
}
async function rejectMessages(page, frame, openSelector) {
  await page.evaluate(() => {
    const data = { channel: 'hgraph:custom-page', version: 1, type: 'close' };
    // Correct origin, but parent-window source, not the hosted iframe.
    window.postMessage(data, location.origin);
    const active = Array.from(document.querySelectorAll('iframe.native-map-frame, .content-modal iframe')).find(frame => frame.getClientRects().length);
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
    assert.equal(await page.locator('iframe.native-map-frame:visible').count(), 0);
  });
  await t.test('Map navigation matches native typography, glyphs, hover and selection', async () => {
    await reader(page);
    const graph = nav(page, 'Dependency graph');
    const map = nav(page, 'Blueprint map');
    const appearance = (locator) => locator.evaluate((element) => {
      const style = getComputedStyle(element);
      const icon = getComputedStyle(element.querySelector('.ni'));
      return { font: style.font, color: style.color, background: style.backgroundColor,
        padding: style.padding, gap: style.gap, radius: style.borderRadius,
        iconFont: icon.font, iconColor: icon.color, iconWidth: icon.width };
    });
    await page.mouse.move(700, 20);
    assert.deepEqual(await appearance(map), await appearance(graph));
    await graph.hover();
    const hovered = await appearance(graph);
    await map.hover();
    assert.deepEqual(await appearance(map), hovered);
    // Show the same selected rail state without letting an overlay cover it.
    await page.mouse.move(700, 20);
    await graph.evaluate((element) => element.classList.add('on'));
    await map.evaluate((element) => element.classList.add('on'));
    try {
      assert.deepEqual(await appearance(map), await appearance(graph));
      assert.notEqual((await appearance(map)).background, hovered.background);
    } finally {
      await graph.evaluate((element) => element.classList.remove('on'));
      await map.evaluate((element) => element.classList.remove('on'));
    }
  });
  await t.test('mobile menu traps focus and dismisses without replacing the reader', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    // Seed the reader at the phone width so desktop-to-phone reflow is not
    // mistaken for a menu-induced scroll change. The desktop rail is hidden.
    await page.goto(`${base}?fixture=${++readerRun}#/enabled#test:node-1`);
    await page.locator('#stmt-node-1.sel:visible').waitFor();
    await page.evaluate(() => {
      window.scrollTo(0, 500);
      window.readerMarker = document.querySelector('.doc-main');
      window.readerQueryMarker = document.querySelector('.navq');
      window.lifecycleLoadToken = crypto.randomUUID();
    });
    await pause();
    const state = await page.evaluate(() => ({ token: window.lifecycleLoadToken, y: scrollY,
      selected: document.querySelector('.stmt.sel')?.id, query: document.querySelector('.navq').value }));
    const trigger = page.getByRole('button', { name: 'Open navigation menu' });
    try {
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: 'Navigation', exact: true });
      await dialog.waitFor();
      assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
      assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
      assert.equal(await page.locator('#blueprint-navigation').isVisible(), false);
      assert.equal(await dialog.locator('#blueprint-mobile-navigation').count(), 1);
      const close = dialog.getByRole('button', { name: 'Close Navigation', exact: true });
      await close.focus();
      await page.keyboard.press('Shift+Tab');
      assert.ok(await dialog.evaluate((element) => element.contains(document.activeElement)));
      await page.keyboard.press('Tab');
      assert.ok(await close.evaluate((element) => element === document.activeElement));
      await page.keyboard.press('Escape');
      await unchanged(page, state);
      assert.ok(await trigger.evaluate((element) => element === document.activeElement));
      await trigger.click();
      await close.click();
      await unchanged(page, state);
      assert.equal(await page.evaluate(() => document.body.style.overflow), '');
    } finally { await page.setViewportSize({ width: 1440, height: 900 }); }
  });
  await t.test('mobile menu opens Map, Graph, custom pages and native views', async () => {
    await reader(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await pause();
    const state = await page.evaluate(() => ({ token: window.lifecycleLoadToken, y: scrollY,
      selected: document.querySelector('.stmt.sel')?.id, query: document.querySelector('.navq').value }));
    const trigger = page.getByRole('button', { name: 'Open navigation menu' });
    const menuLink = async (name) => {
      await trigger.click();
      return page.locator('#blueprint-mobile-navigation .navlink').filter({ hasText: name });
    };
    try {
      await (await menuLink('Blueprint map')).click();
      assert.equal(await page.getByRole('dialog', { name: 'Navigation', exact: true }).count(), 0);
      const frame = await (await page.locator('iframe.native-map-frame:visible').elementHandle()).contentFrame();
      await frame.locator('.node-card').first().waitFor();
      await frame.locator('#map-close').click();
      await unchanged(page, state);
      assert.ok(await trigger.evaluate((element) => element === document.activeElement));
      await (await menuLink('Dependency graph')).click();
      await page.getByRole('button', { name: 'Close graph', exact: true }).click();
      await unchanged(page, state);
      await (await menuLink('Inline tool')).click();
      await page.getByRole('button', { name: 'Finish inline' }).click();
      await unchanged(page, state);
      await (await menuLink('Blueprint summary')).click();
      await page.getByRole('heading', { name: 'Blueprint summary', exact: true }).waitFor();
      await trigger.click();
      await page.getByRole('button', { name: 'View results', exact: true }).click();
      await waitFor(async () => await page.locator('.doc-main .stmt:visible').count() === entries.length, 'View results did not leave the summary');
      await (await menuLink('Blueprint bibliography')).click();
      assert.equal(await page.getByRole('dialog', { name: 'Navigation', exact: true }).count(), 0);
      await (await menuLink('Default page')).click();
      await page.getByRole('heading', { name: 'Default page content' }).waitFor();
      await page.getByRole('button', { name: 'Finish page' }).click();
      await (await menuLink('Overview')).click();
      await page.locator('.maketitle').waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    } finally { await page.setViewportSize({ width: 1440, height: 900 }); }
  });
  await t.test('mobile menu supports search, status filters, chapter sections and resizing', async () => {
    await reader(page);
    await page.setViewportSize({ width: 390, height: 844 });
    const trigger = page.getByRole('button', { name: 'Open navigation menu' });
    const mobile = page.locator('#blueprint-mobile-navigation');
    try {
      await trigger.click();
      await mobile.getByRole('textbox', { name: 'Search statements' }).fill('Lifecycle result 2');
      await mobile.getByRole('textbox', { name: 'Search statements' }).press('Enter');
      await waitFor(async () => await page.locator('.doc-main .stmt:visible').count() === 1, 'Mobile search did not reach the reader');
      await trigger.click();
      assert.equal(await mobile.locator('.navq').inputValue(), 'Lifecycle result 2');
      await mobile.locator('.navq').fill('');
      await mobile.getByRole('button', { name: 'lean ok', exact: true }).click();
      assert.equal(await mobile.getByRole('button', { name: 'lean ok', exact: true }).getAttribute('aria-pressed'), 'true');
      await page.getByRole('button', { name: 'View results', exact: true }).click();
      await waitFor(async () => await page.locator('.doc-main .stmt:visible').count() === 4, 'Mobile status filter did not reach the reader');
      await trigger.click();
      await mobile.getByRole('button', { name: 'Expand chapter 2', exact: true }).click();
      assert.equal(await mobile.getByRole('button', { name: 'Collapse chapter 2', exact: true }).getAttribute('aria-expanded'), 'true');
      await mobile.locator('.tsec').last().click();
      await page.getByRole('heading', { name: /Second chapter/ }).waitFor();
      assert.equal(await mobile.count(), 0);
      await trigger.click();
      await mobile.locator('.tch-link').first().click();
      await page.getByRole('heading', { name: /First chapter/ }).waitFor();
      await trigger.click();
      await page.setViewportSize({ width: 1440, height: 900 });
      await waitFor(async () => await mobile.count() === 0, 'Menu did not dismiss at the desktop breakpoint');
      assert.equal(await trigger.isVisible(), false);
      assert.equal(await page.evaluate(() => document.body.style.overflow), '');
      await page.getByRole('button', { name: 'Collapse navigation panel', exact: true }).click();
      await page.setViewportSize({ width: 390, height: 844 });
      await trigger.click();
      assert.equal(await mobile.isVisible(), true, 'Desktop panel preference hid the mobile menu');
      await page.getByRole('button', { name: 'Close Navigation', exact: true }).click();
    } finally {
      await page.setViewportSize({ width: 1440, height: 900 });
      const expand = page.getByRole('button', { name: 'Expand navigation panel', exact: true });
      if (await expand.count()) await expand.click();
    }
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
  await t.test('Map reopens with the same document, search and zoom', async () => {
    await reader(page);
    const frame=await mapFrame(page);
    await frame.locator('#map-search').fill('Lifecycle');
    await frame.locator('#map-zoom-in').click();
    const zoom=await frame.locator('#map-zoom-level').textContent();
    const token=await frame.evaluate(()=>window.mapToken=crypto.randomUUID());
    const before=requests.filter(path=>path.includes('blueprint-map/renderer.html')).length;
    await frame.locator('#map-close').click();
    const again=await mapFrame(page);
    assert.equal(await again.evaluate(()=>window.mapToken),token);
    assert.equal(await again.locator('#map-search').inputValue(),'Lifecycle');
    assert.equal(await again.locator('#map-zoom-level').textContent(),zoom);
    assert.equal(requests.filter(path=>path.includes('blueprint-map/renderer.html')).length,before);
    await again.locator('#map-close').click();
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
    await rejectMessages(page, frame, 'iframe.native-map-frame:visible');
    await frame.evaluate(() => window.hgraph.navigate('test:unknown'));
    await pause();
    assert.equal(await page.locator('iframe.native-map-frame:visible').count(), 1, 'Unknown locator closed Map');
    await frame.evaluate(() => window.hgraph.close());
    await unchanged(page, state);
  });
  await t.test('Map Blueprint links navigate through the SDK without reloading', async () => {
    const state = await reader(page);
    const frame = await mapFrame(page);
    await frame.locator('[data-node="node-2"] .node-preview-toggle').click({ force: true });
    await frame.getByRole('link', { name: 'Open in Blueprint', exact: false }).click({ force: true });
    await page.locator('#stmt-node-2.sel:visible').waitFor();
    assert.equal(await page.locator('.content-modal:visible').count(), 0);
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
    await page.locator('#stmt-node-2.sel:visible').waitFor();
    assert.equal(await page.locator('.content-modal:visible').count(), 0);
    assert.equal(await page.evaluate(() => window.lifecycleLoadToken), state.token);
  });
  await t.test('default custom pages return to their previous view on close', async () => {
    const state = await reader(page);
    await nav(page, 'Default page').click();
    await page.getByRole('heading', { name: 'Default page content', exact: true }).waitFor();
    assert.equal(await page.locator('.content-modal:visible').count(), 0, 'Default page became a modal');
    await page.getByRole('button', { name: 'Finish page', exact: true }).click();
    await page.locator('#stmt-node-1.sel:visible').waitFor();
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
    await waitFor(async () => await page.locator('.content-modal:visible').count() === 0, 'Nested modal remained open');
    assert.equal(await page.getByRole('heading', { name: 'Default page content', exact: true }).count(), 1,
      'A modal close event also closed the underlying custom page');
    assert.ok(await nav(page, 'Default page').evaluate((element) => element.classList.contains('on')));
    assert.equal(await page.evaluate(() => window.lifecycleLoadToken), state.token);
    await page.getByRole('button', { name: 'Finish page', exact: true }).click();
    await page.locator('#stmt-node-1.sel:visible').waitFor();
  });
  await t.test('custom pages retain the same iframe and state until LRU eviction or reload', async () => {
    await reader(page, '', 'cache-fixture');
    await nav(page, 'Cached iframe').click();
    const iframe = page.frameLocator('iframe[title="Cached tool"]');
    await iframe.getByRole('heading', {name:'Iframe lifecycle tool'}).waitFor();
    const before = requests.filter(path => path.endsWith('/widgets/tool.html')).length;
    const token = await iframe.locator('body').evaluate(el => {
      window.cacheToken = crypto.randomUUID();
      const input = document.createElement('input'); input.id='draft'; input.value='retained draft';el.append(input);
      return window.cacheToken;
    });
    await nav(page, 'Overview').click();
    // A retained, hidden iframe must not close or navigate its parent's active page.
    await page.locator('iframe[title="Cached tool"]').evaluate(frame => frame.contentWindow.hgraph.navigate('test:node-9'));
    await pause();
    assert.ok(await nav(page,'Overview').evaluate(el => el.classList.contains('on')));
    await nav(page, 'Cached iframe').click();
    assert.equal(await iframe.locator('#draft').inputValue(), 'retained draft');
    assert.equal(await iframe.locator('body').evaluate(() => window.cacheToken), token);
    assert.equal(requests.filter(path => path.endsWith('/widgets/tool.html')).length, before);
    for(let i=0;i<7;i++) { await nav(page, 'Extra '+i).click(); await page.getByRole('heading',{name:'Extra '+i,exact:true}).waitFor(); }
    assert.equal(await page.locator('iframe[title="Cached tool"]').count(),0,'Least recent iframe was not evicted');
    assert.ok(await page.locator('.doc-main > [data-view-active]').count() <= 6);
    await nav(page, 'Cached iframe').click();
    await iframe.getByRole('heading', {name:'Iframe lifecycle tool'}).waitFor();
    assert.equal(await iframe.locator('#draft').count(),0);
    assert.equal(requests.filter(path => path.endsWith('/widgets/tool.html')).length, before+1);
    await page.reload();
    await page.locator('.project-header').waitFor();
    assert.equal(await page.locator('iframe[title="Cached tool"]').count(),0,'Reload retained a stale view cache');
  });
  await t.test('chapters retain expanded details and math nodes across utility pages', async () => {
    await reader(page,'');
    const statement = page.locator('#stmt-node-1:visible');
    await statement.waitFor();
    await statement.evaluate(el => { window.cachedStatement=el; window.cachedMath=el.querySelector('.katex'); });
    await nav(page,'Blueprint summary').click();
    await page.locator('#blueprint-navigation .tch-link').filter({hasText:'First chapter'}).click();
    await statement.waitFor();
    assert.ok(await statement.evaluate(el => el===window.cachedStatement));
    assert.ok(await statement.evaluate(el => el.querySelector('.katex')===window.cachedMath));
  });
  await t.test('dependency graph retains filters and its SVG when reopened', async () => {
    await reader(page);
    await nav(page,'Dependency graph').click();
    await page.locator('.gv-inner svg:visible').waitFor();
    const input=page.locator('.graph-modal:visible input');
    if(await input.count()) await input.first().fill('Lifecycle');
    await page.locator('.gv-inner svg:visible').evaluate(el=>window.cachedGraph=el);
    await page.locator('.graph-modal:visible .gm-bar button').last().click();
    await nav(page,'Dependency graph').click();
    assert.ok(await page.locator('.gv-inner svg:visible').evaluate(el=>el===window.cachedGraph));
    if(await input.count()) assert.equal(await input.first().inputValue(),'Lifecycle');
    await page.keyboard.press('Escape');
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
    await waitFor(async () => await page.locator('.content-modal:visible').count() === 0, 'Workspace modal remained open');
    assert.ok(await page.evaluate(() => window.workspaceCards === document.querySelector('.card-grid')),
      'Workspace modal replaced the Projects DOM');
    await landingNav('Workspace page').click();
    await page.getByRole('heading', { name: 'Workspace page content', exact: true }).waitFor();
    assert.equal(await page.locator('.content-modal:visible').count(), 0);
    // Exercise the same covered-page case on the workspace.
    await landingNav('Workspace tool').click();
    await page.getByRole('dialog', { name: 'Workspace tool', exact: true }).waitFor();
    await page.evaluate(() => window.hgraph.close());
    await waitFor(async () => await page.locator('.content-modal:visible').count() === 0, 'Workspace modal remained open');
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
    await waitFor(async () => await page.locator('.graph-modal:visible').count() === 0, 'Graph did not close');
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
