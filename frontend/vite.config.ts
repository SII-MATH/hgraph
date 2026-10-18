import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { X, Minus, Plus, Maximize, ChevronRight, ExternalLink } from 'lucide-react'

// KaTeX's CSS ships woff2 + woff + ttf fallbacks for every font, but woff2
// alone covers every browser this app targets — the fallbacks just triple
// the font payload for nothing. This bundle is shared and cached across the
// whole workspace (one copy for every project + the landing page), so
// trimming it is worth it. Same trick the old Python vendoring used to do
// server-side (`_vendor_katex`), just applied to the Vite build instead.
function trimFontFallbacks(): Plugin {
  return {
    name: 'trim-font-fallbacks',
    generateBundle(...args) {
      const bundle = args[1]
      const drop = new Set<string>()
      for (const file of Object.values(bundle)) {
        if (file.type !== 'asset' || !file.fileName.endsWith('.css')) continue
        if (typeof file.source !== 'string') continue
        file.source = file.source.replace(
          /,url\((\.\/[^)]+\.(?:woff|ttf))\)format\("(?:woff|truetype)"\)/g,
          (_m, rel: string) => { drop.add(rel.replace(/^\.\//, '')); return '' },
        )
      }
      for (const name of drop) {
        const key = Object.keys(bundle).find((k) => k.endsWith(name))
        if (key) delete bundle[key]
      }
    },
  }
}

// The standalone map iframe imports the same built KaTeX module as React.
// Publish the actual asset names instead of scraping a minified entry bundle.
function mapMathAssets(): Plugin {
  const icons = Object.fromEntries(Object.entries({ x: X, minus: Minus, plus: Plus,
    maximize: Maximize, 'chevron-right': ChevronRight, 'external-link': ExternalLink })
    .map(([name, component]) => [name, renderToStaticMarkup(createElement(component,
      { size: 16, strokeWidth: 2, 'aria-hidden': true, focusable: false }))]));
  return {
    name: 'map-math-assets',
    configureServer(server) {
      server.middlewares.use('/blueprint-map/math-assets.json', (_request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ js: '../src/katexLoader.ts', css: '../node_modules/katex/dist/katex.min.css',
          theme: '../src/index.css', icons }));
      });
    },
    generateBundle(_options, bundle) {
      const module = Object.values(bundle).find((file) => file.type === 'chunk'
        && file.facadeModuleId?.endsWith('/src/katexLoader.ts'));
      if (!module || module.type !== 'chunk') throw new Error('Native map KaTeX module is missing');
      const css = [...((module as typeof module & { viteMetadata?: { importedCss: Set<string> } }).viteMetadata?.importedCss || [])][0];
      if (!css) throw new Error('Native map KaTeX stylesheet is missing');
      const entry = Object.values(bundle).find((file) => file.type === 'chunk' && file.isEntry);
      const theme = entry?.type === 'chunk'
        ? [...((entry as typeof entry & { viteMetadata?: { importedCss: Set<string> } }).viteMetadata?.importedCss || [])][0]
        : undefined;
      if (!theme) throw new Error('Native hgraph stylesheet is missing');
      this.emitFile({ type: 'asset', fileName: 'blueprint-map/math-assets.json',
        source: JSON.stringify({ js: '../' + module.fileName, css: '../' + css,
          theme: '../' + theme, icons }) });
    },
  };
}

// base: './' — the built assets are referenced with relative paths, so the
// same build works whether it's opened at the repo root, one level under a
// workspace landing page, live via `hgraph serve`, or on GitHub Pages.
//
// outDir points *inside the Python package* (../hgraph/webui) — this is a
// pre-built bundle shipped with hgraph, per pyproject.toml's package-data.
// `npm run build` here is a dev-time step for whoever edits the frontend;
// end users of `pip install hgraph` never need Node.
export default defineConfig({
  plugins: [react(), trimFontFallbacks(), mapMathAssets()],
  base: './',
  build: {
    outDir: '../hgraph/webui',
    emptyOutDir: true,
  },
})
