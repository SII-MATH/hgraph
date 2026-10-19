# hgraph frontend (dev)

The whole site (`hgraph site`) is one React/Vite app — a landing page and a
per-project view, hash-routed client-side (`#/`, `#/<root>`). There is no
separate "dashboard" artifact; one project or many, it's all this app. This
directory is the *source* — end users never touch it; `pip install hgraph`
ships the already-built output at `../hgraph/webui/`.

```bash
npm install
npm run dev      # local dev server with HMR (fetches /api/site, /<root>/project.json
                  # from nowhere useful on its own — point it at a running
                  # `hgraph serve` if you need real data)
npm run build    # writes straight into ../hgraph/webui/ (outDir in vite.config.ts)
```

**After any change here, run `npm run build` and commit the updated
`hgraph/webui/` output** — that's the artifact that actually ships.

Data contracts: `src/types.ts` — `SiteData` (landing, `window.__HGRAPH_DATA__`
or `GET /api/site`) and `ProjectData` (`<root>/project.json`, followed by its
versioned `lazy` chapter/graph paths). A monolithic `<root>/data.json` remains
as a compatibility fallback. Every bit of rendering — math
(`katex/contrib/auto-render`), Lean
code, dependency chips, the review form — lives here.

Scope note: the project view (`ProjectView.tsx`) covers everything the old
Python renderer did — statements, Lean code, dependencies, reviews/comments,
the interactive dependency-graph modal (`GraphModal.tsx`, Graphviz-as-WASM in
a Web Worker), hover-preview popups (`HoverPreview.tsx`), the search/filter
sidebar, and bibliography rendering (`Bibliography.tsx`).

## Page lifetime and reuse

Project pages retain up to six recently visited main views and three overlays; the workspace retains four pages and two overlays. Views mount on first visit, with least-recently-used eviction. Stable DOM order and HTML injection only on source changes preserve iframe browsing contexts, form drafts, expanded details, reading positions and rendered math. React Activity removes hidden React effects, so hidden pages cannot issue navigation commands or retain modal keyboard handlers and scroll locks. Native maps and graphs preserve their view controls when reopened.

The cache belongs to the current document and project root. Switching projects or refreshing destroys it, and refresh reads the newly exported data; no persistent browser cache can mask a new publication. Ordinary chapter/graph requests keep their existing lazy loading and request deduplication. Explicit statement navigation resolves visible anchors even when a retained search page contains the same statement.

Run `npm test`, `npm run build`, `npm run lint`, and `npm run test:browser`. Browser checks cover a preserved URL prefix, retained iframe identity, hidden-message isolation, bounded eviction, reset on refresh, map/graph controls and native modal focus behavior.
