import type { Entry, ProjectData } from './types';
import { plainTex } from './latex';

export interface MapNode {
  id: string; label: string; title: string; display_title: string; body: string;
  chapter: string; section: string; kind: string; status: Entry['lean_status'];
  order: number; ref: string; sketch: boolean; url: string;
}

/** Exact view of native statements/uses edges, never a second proof-status model. */
export function buildMapData(project: ProjectData, root: string) {
  const indexed = new Map(project.entries.map((entry) => [entry.id, entry]));
  if (indexed.size !== project.entries.length) throw new Error('Duplicate map statement id');
  const labels = project.entries.map((entry) => entry.label || entry.id);
  if (new Set(labels).size !== labels.length) throw new Error('Duplicate map statement label');
  const route = `../#/${root}`;
  const nodes: MapNode[] = [];
  const seen = new Set<string>();
  type Section = { id: string; title: string; nodes: MapNode[] };
  const sourceChapters = project.chapters?.length ? project.chapters : [{
    title: project.title, blocks: project.entries.map((entry, index) => ({
      t: 'stmt' as const, id: entry.id, label: entry.label || entry.id,
      abbr: entry.kind, num: String(index + 1),
    })),
  }];
  const chapters = sourceChapters.map((chapter, index) => {
    const sections: Section[] = [];
    let section: Section | undefined;
    for (const block of chapter.blocks) {
      if (block.t === 'head' && block.level === 2) {
        section = { id: `section-${index + 1}-${sections.length + 1}`, title: block.title, nodes: [] };
        sections.push(section);
      }
      if (block.t !== 'stmt') continue;
      const entry = block.id ? indexed.get(block.id) : undefined;
      if (!entry || seen.has(entry.id)) throw new Error('Unknown or repeated map chapter statement');
      if (block.label !== (entry.label || entry.id)) throw new Error('Map chapter and entry labels disagree');
      if (!section) {
        section = { id: `section-${index + 1}-1`, title: chapter.title, nodes: [] };
        sections.push(section);
      }
      const label = entry.label || entry.id;
      const node: MapNode = {
        id: entry.id, label, title: entry.title || label,
        display_title: `${block.abbr} ${block.num}: ${plainTex(entry.title || label)}`,
        body: entry.body, chapter: chapter.title, section: section.title, kind: entry.kind,
        status: entry.lean_status, order: nodes.length,
        ref: entry.ref || '', sketch: !!entry.sketch,
        url: `${route}#${encodeURIComponent(label)}`,
      };
      seen.add(entry.id); nodes.push(node); section.nodes.push(node);
    }
    return { id: `chapter-${index + 1}`, title: chapter.title, sections: sections.filter((group) => group.nodes.length) };
  });
  if (seen.size !== indexed.size) throw new Error('Native statements missing from map chapters');
  const edgePairs = new Map<string, {from: string; to: string}>();
  for (const consumer of project.entries) {
    for (const dependency of consumer.deps) {
      if (dependency.type !== 'uses') continue;
      if (!indexed.has(dependency.id)) throw new Error('Map dependency is outside the native statement graph');
      if (dependency.id === consumer.id) throw new Error('Self-dependent map statement');
      const pair = { from: dependency.id, to: consumer.id };
      edgePairs.set(JSON.stringify([pair.from, pair.to]), pair);
    }
  }
  const edges = [...edgePairs.values()].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  const statuses: Record<string, number> = {};
  for (const node of nodes) statuses[node.status] = (statuses[node.status] || 0) + 1;
  return { title: project.title, project_route: route, theme: project.theme, chapters, nodes, edges,
    important_labels: [], macros: project.macros || {}, refs: project.refs || {}, bib: project.bib || [],
    stats: { nodes: nodes.length, edges: edges.length, chapters: chapters.length, important: 0, statuses } };
}
