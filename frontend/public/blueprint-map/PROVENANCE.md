# Blueprint Map provenance

The visual layout and interactions in `renderer.html` are adapted from the
Map served at [the reference Blueprint](https://frenzymath.github.io/Poincare-Conjecture/#/PoincareConjecture),
from the [frenzymath/Poincare-Conjecture repository](https://github.com/frenzymath/Poincare-Conjecture).
The source artifact was the Map iframe `srcdoc` from the live project payload,
retrieved on 2026-10-18 (UTC).

- Original extracted HTML SHA-256: `c3d68d30ea34a10844550cf78577ebbcac43581c5532585a7a0e1de7dada356e`.
- [Upstream LICENSE](https://raw.githubusercontent.com/frenzymath/Poincare-Conjecture/main/LICENSE)
  is copied verbatim to `LICENSE` (Apache-2.0).
- [Upstream NOTICE](https://raw.githubusercontent.com/frenzymath/Poincare-Conjecture/main/NOTICE)
  is copied verbatim to `UPSTREAM-NOTICE`. Those notices describe the upstream
  distribution; this adaptation includes its Map renderer, without Lean files.

The adaptation preserves the chapter and section layout, node cards, dependency
arrows and depth colors, search and filters, zoom and fit controls, canvas
panning, and statement previews. Embedded upstream project data was removed.
The renderer fetches `./data.json`, uses Kervaire project links and references,
shows the existing sketch marker, and loads the exported local hgraph KaTeX
module and stylesheet. No external math CDN is used. The hgraph frontend is
unchanged.

## Data contract

The local JSON object contains `title`, `chapters`, `nodes`, `edges`,
`important_labels`, and `stats`. Each chapter has `id`, `title`, and `sections`;
each section has `id`, `title`, and `nodes`. The global and nested nodes share
identifiers. Edges use `{ "from": prerequisiteId, "to": dependentId }`.

Each node provides `id`, `label`, `title`, `display_title`, `body`, `chapter`,
`section`, `kind`, `status`, `order`, `ref`, and optional `sketch` and `url`.
Status uses `lean_ok`, `mathlib_ok`, `sorry`, or `empty`. Status and sketch are
inherited from the exported Blueprint; this renderer does not verify proofs.

`project_route` is relative to `renderer.html`, normally `../#/Kervaire126`.
An explicit node `url` is preferred; otherwise links append `#<label>` to that
route. References use the original `refs` objects and bibliography uses `bib`.
`macros` contains the exported KaTeX macro dictionary. `katex` has `js` and
`css` URLs relative to the renderer, pointing to the same-origin hgraph assets.
If these URLs are absent, the renderer discovers those assets from the parent
hgraph entry module. The JS asset must export the native auto-render function
as its default export.

## Native hgraph integration

SII-MATH/hgraph packages this renderer as an opt-in native modal. In native
mode it receives the complete native graph from its host via the versioned
custom-page bridge, closes through `hgraph.close()` without refreshing the
parent, and navigates through `hgraph.navigate()`. KaTeX paths come from a
manifest generated alongside the frontend bundle. The original attribution,
license, notices and extraction hash above remain preserved.

The native integration now loads the same compiled hgraph stylesheet as the
reader, uses its typography, control classes, status colors and project accent,
and obtains SVG icons from the same lucide-react components at build time.
Node labels use the native plain-TeX formatter; detail titles and statements
share the bundled KaTeX renderer.
