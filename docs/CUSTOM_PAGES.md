# Blueprint Map and custom-page lifecycle

Projects can enable the built-in Blueprint Map and add custom pages in their
`hgraph/config.yaml`. The Map and modal pages open above the reading view;
closing them keeps the current chapter, selection, search query, and scroll
position. Closing does not reload the application.

## Mobile navigation

At widths up to 900 CSS pixels, each project's header includes a **Menu**
button. It opens the same native navigation in a dialog: search and status
filters, built-in views, enabled custom pages, the optional Map, and chapter
and section links. Selecting a destination closes the menu. Press Enter in
search, or select **View results**, to return to filtered statements.

The menu uses the project's theme, traps keyboard focus, locks background
scrolling, and restores focus when dismissed with its close button or Escape.
Dismissal keeps the current reader, selection, query, and reading position.
Moving back above 900 pixels closes the menu and restores desktop navigation.
Desktop panel preferences do not hide the mobile menu. No configuration is
needed; `site.map` and custom-page settings continue to control their entries.

## Enable the built-in Map

```yaml
site:
  map: true
```

The default is off. To change the navigation label:

```yaml
site:
  map:
    enabled: true
    label: Proof map
```

`map: false` or `map: {enabled: false}` disables the entry. Existing exports
without this setting retain their existing navigation. The separate native
**Dependency graph** continues to work independently.

The Map uses the project's exported statements, `uses` edges, chapter and
section order, formalization statuses, sketch markers, references, bibliography,
and mathematical macros. It loads any required chapter/graph payloads before
opening. It does not need a project-authored HTML page, a custom tab, or a
separate `blueprint-map/data.json`. Math uses the local hgraph KaTeX assets.

The Map supports search, chapter/status filters, dependency-depth highlights,
zoom, fit, panning, and statement previews. Its close button returns directly to
the reader. Escape in the Map first dismisses a statement preview, then clears a
focused node, then closes the Map. Escape in the parent document closes its
modal directly. Following a Blueprint link closes the Map and navigates the
reader to that statement.

## Add a custom page or modal

```yaml
site:
  tabs:
    - id: references
      label: References
      content: references.md
      # presentation: page is the default
    - id: calculator
      label: Calculator
      content: calculator.html
      presentation: modal
      enabled: true
```

Content paths are relative to the project root. Markdown is converted to HTML;
HTML is used as authored, then mathematical formulas are typeset. `enabled:
false` omits a tab. Custom tab IDs must be unique and cannot use a built-in ID
such as `map`, `graph`, `doc`, or `overview`.

`presentation: modal` keeps the reader DOM mounted beneath a full-screen
native dialog, locks background scrolling, and restores focus on close. A page
uses the main content area instead; its close action returns to the previous
view and scroll position. The default remains `page` for compatibility.

Inline HTML is trusted project content, but injected `<script>` elements do not
execute. For a simple inline close button, use the delegated close attribute:

```html
<section>
  <h2>A supplementary result</h2>
  <p>Here is the calculation: $d_r^2=0$.</p>
  <button type="button" data-hgraph-close>Return to Blueprint</button>
</section>
```

JavaScript that already runs in the host document can also close the active
custom page with either of these public interfaces:

```js
window.hgraph.close();
window.dispatchEvent(new CustomEvent('hgraph:close'));
```

Do not use a reload or modify the parent's location merely to close a page.
Use the lifecycle API so the reading state survives.

## Workspace tabs

The workspace manifest supports the same `presentation` and close behavior in
its top-level `tabs` list:

```yaml
title: My workspace
tabs:
  - id: notes
    label: Notes
    content: notes.md
  - id: tool
    label: Tool
    content: tool.html
    presentation: modal
projects:
  - name: My Blueprint
    root: my-project
```

A workspace page returns to its previous tab, normally **Projects**, when it
closes. A modal preserves the view beneath it. If a modal covers another custom
page, a close event closes only that modal; it leaves the covered page open.
The SDK's `close()` applies to workspace and project custom pages. Statement
`navigate()` is a project-Blueprint operation, not workspace navigation.

## Interactive same-origin iframe

An interactive tool can run in an iframe instead of relying on injected
scripts. Load the SDK in the iframe's own HTML:

```html
<!-- tools/calculator.html, exported alongside the static site assets -->
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <script src="../hgraph-custom-page.js"></script>
</head>
<body>
  <button type="button" id="close">Return to Blueprint</button>
  <button type="button" id="jump">Open the cited theorem</button>
  <script>
    document.querySelector('#close').addEventListener('click', () => {
      window.hgraph.close();
    });
    document.querySelector('#jump').addEventListener('click', () => {
      window.hgraph.navigate('thm:main-result');
    });
    window.hgraph.ready();
  </script>
</body>
</html>
```

The authored tab content can embed that file:

```html
<iframe title="Calculator" src="tools/calculator.html"
        style="width:100%;height:70vh;border:0"></iframe>
```

HTML asset URLs resolve against the exported site document, not the source
Markdown/HTML file. Include the tool and its assets in the static deployment,
and choose their relative URLs for that layout. The SDK is copied to the site
root as `hgraph-custom-page.js`; `../hgraph-custom-page.js` is appropriate for an
iframe one directory below that root. Relative paths preserve a public proxy
prefix such as `/proxy/18726/`; root-absolute paths discard it.

The parent page loads the SDK globally. Iframes each load their own copy. The
API is versioned and immutable:

| API | Action |
| --- | --- |
| `window.hgraph.version` | Protocol version, currently `1`. |
| `window.hgraph.close()` | Close the current custom page/modal or native Map. |
| `window.hgraph.navigate(locator)` | Close the overlay and navigate to a statement ID, statement label, or chapter locator such as `ch-2`. |
| `window.hgraph.ready()` | Announce that the iframe is ready; the native Map uses this to request its project data. |

`navigate` requires a nonempty string. Use a locator that exists in the current
project. Unknown locators are ignored and leave the current page open. No
cross-project URL or arbitrary JavaScript is accepted as a locator.

The iframe SDK also closes the current page on Escape. A tool can consume Escape
by calling `event.preventDefault()` in its document-level key handler; the SDK
respects that decision. The built-in Map uses this to dismiss its preview and
node focus before closing.

## Version 1 message protocol

The SDK dispatches lifecycle events when running in the main window and sends
messages to its parent when running in an iframe. A same-origin iframe can
implement the message format directly if necessary:

```js
window.parent.postMessage({
  channel: 'hgraph:custom-page',
  version: 1,
  type: 'navigate', // 'close' or 'ready' are also supported
  locator: 'thm:main-result'
}, window.location.origin);
```

The host checks all of the following before accepting an iframe command:

- The message origin equals the host's origin.
- The source is an iframe belonging to the active content container (or the
  current native Map iframe).
- The channel, version, message type, and required locator match the protocol.

A sibling iframe outside the active container cannot close its modal. Messages
from another origin, the parent window itself, or an unsupported version are
ignored. Cross-origin embedded content can be displayed but cannot use this
same-origin lifecycle channel. Serve previews over HTTP; use a local static
server rather than opening the HTML with a `file:` URL.

The native Map sends `ready`. Its host replies to that iframe with
`{channel: 'hgraph:custom-page', version: 1, type: 'map-data', data: ...}` at the
same origin. The Map checks the origin and that the source is its parent before
using the payload. Custom pages do not need to implement this Map handshake.

For React consumers, `ContentPage` accepts `onClose` and `onNavigate` callbacks.
It delegates inline close-button clicks, listens for the host lifecycle events,
and validates messages from its contained iframes. `ContentModal` supplies the
native dialog chrome, focus handling, Escape behavior, and scroll locking.

## Reproduce browser checks

Build the frontend, then run the Node/Playwright test from `frontend/`:

```bash
npm ci
npm run build
CHROMIUM=/path/to/chrome node --test tests/lifecycle.browser.mjs
```

Without `CHROMIUM`, the test uses
`/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`.
It copies the built `hgraph/webui` to a temporary directory, creates a small
static project and iframe tool, and serves them under `/proxy/18726/`. It does
not require a running hgraph server, an external service, or project sources.

The checks cover opt-in Map navigation, complete node/status transfer, local
math, zoom, Escape ordering, retained reading DOM/state, inline and iframe
close/navigation, default page behavior, rejected lifecycle messages, prefix
paths, and the existing native Dependency graph. Temporary assets and the
server are removed after the run.
