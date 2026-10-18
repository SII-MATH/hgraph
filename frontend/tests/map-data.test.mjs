import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
after(() => server.close());
const { buildMapData } = await server.ssrLoadModule('/src/mapData.ts');
const { isCustomPageMessage } = await server.ssrLoadModule('/src/customPage.ts');
const entry = (id, status, dependencies = []) => ({ id, label: 'sem:' + id, title: id,
  body: `For every $x$, $x=x$.`, kind: 'theorem', lean_status: status, sketch: id === 'b',
  deps: dependencies.map(id => ({ id, type: 'uses' })), ref: 'Paper 1.2' });
const block = id => ({ t: 'stmt', id, label: 'sem:' + id, abbr: 'Thm', num: '1.' + id });
const fixture = () => ({ title: 'Example', entries: [entry('a', 'sorry'), entry('b', 'lean_ok', ['a'])],
  chapters: [{ title: 'Foundations', blocks: [{ t: 'head', level: 2, title: 'Objects' }, block('a')] },
    { title: 'Main', blocks: [block('b')] }],
  macros: { '\\Z': '\\mathbb{Z}' }, refs: { 'sem:a': { id: 'a', num: '1.1' } }, bib: [{ key: 'Source' }] });

test('map preserves every native body, local status, sketch and uses edge', () => {
  const project = fixture(), before = structuredClone(project);
  project.entries[0].deps.push({ id: 'external-source', type: 'related_to' });
  before.entries[0].deps = structuredClone(project.entries[0].deps);
  const result = buildMapData(project, 'Example');
  assert.deepEqual(project, before);
  assert.deepEqual(result.edges, [{ from: 'a', to: 'b' }]);
  assert.deepEqual(result.nodes.map(n => [n.id, n.status]), [['a', 'sorry'], ['b', 'lean_ok']]);
  assert.equal(result.nodes[1].sketch, true);
  assert.equal(result.nodes[1].body, project.entries[1].body);
  assert.equal(result.nodes[1].ref, 'Paper 1.2');
  assert.equal(result.nodes[1].url, '../#/Example#sem%3Ab');
  assert.equal(result.chapters.length, 2);
  assert.deepEqual(result.macros, project.macros);
  assert.deepEqual(result.refs, project.refs);
  assert.deepEqual(result.stats.statuses, { sorry: 1, lean_ok: 1 });
});

test('list-mode projects get one complete map chapter without special configuration', () => {
  const project = fixture(); delete project.chapters;
  const result = buildMapData(project, 'AnotherProject');
  assert.equal(result.chapters.length, 1);
  assert.equal(result.nodes.length, 2);
  assert.equal(result.project_route, '../#/AnotherProject');
});

test('incomplete, inconsistent and duplicate identities cannot silently disappear', () => {
  let project = fixture(); project.chapters[1].blocks = [];
  assert.throws(() => buildMapData(project, 'Example'), /missing/);
  project = fixture(); project.chapters[0].blocks.push(block('a'));
  assert.throws(() => buildMapData(project, 'Example'), /repeated/);
  project = fixture(); project.entries[0].deps.push({ id: 'missing', type: 'uses' });
  assert.throws(() => buildMapData(project, 'Example'), /outside/);
  project = fixture(); project.entries[0].deps.push({ id: 'a', type: 'uses' });
  assert.throws(() => buildMapData(project, 'Example'), /Self-dependent/);
  project = fixture(); project.entries[1].label = 'sem:a';
  assert.throws(() => buildMapData(project, 'Example'), /Duplicate/);
});

test('lifecycle commands require a known channel, version, action and valid locator', () => {
  const command = { channel: 'hgraph:custom-page', version: 1, type: 'close' };
  assert.equal(isCustomPageMessage(command), true);
  assert.equal(isCustomPageMessage({ ...command, type: 'navigate', locator: 'sem:a' }), true);
  for (const invalid of [null, {}, { ...command, channel: 'other' }, { ...command, version: 2 },
    { ...command, type: 'reload' }, { ...command, type: 'navigate' },
    { ...command, type: 'navigate', locator: 5 }]) assert.equal(isCustomPageMessage(invalid), false);
});
