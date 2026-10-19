import { useEffect, useMemo, useRef } from 'react';
import { proseHtml, type CiteNums, type RefEntry } from '../latex';
import { typesetMath } from '../typeset';
import { useHtml } from '../useHtml';

/**
 * Renders `text` as full text-mode LaTeX -> HTML (see latex.ts's `detex`):
 * `\emph{}`, lists, quotes, accents, `\ref`/`\cite` links, … — with math
 * spans left for KaTeX's auto-render (lazily loaded through typeset.ts, so
 * the entry bundle doesn't carry KaTeX; the old dashboard loaded the same
 * katex/contrib/auto-render from a CDN script tag).
 * `refs` resolves `\ref`/`\cref` to numbered links; `onNavigate`/`onCite`
 * handle clicks on those links (event-delegated, since the content is raw
 * HTML, not JSX).
 */
export function Math({
  text,
  macros,
  refs,
  cites,
  as: As = 'span',
  className,
  id,
  onNavigate,
  onCite,
}: {
  text?: string | null;
  macros?: Record<string, string>;
  refs?: Record<string, RefEntry>;
  /** bib key -> number, so `\cite` renders as "[2]" (see latex.ts's citeNums) */
  cites?: CiteNums;
  as?: 'span' | 'div' | 'p';
  className?: string;
  /** element id for deep-links / bibliography "Cited in" jumps */
  id?: string;
  onNavigate?: (id: string) => void;
  onCite?: (key: string) => void;
}) {
  const ref = useRef<HTMLElement | null>(null);

  // Convert prose only when its content or reference context changes.
  const html = useMemo(() => {
    const full = proseHtml(text, refs, cites);
    return As === 'p' ? full : full.replace(/^<p>/, '').replace(/<\/p>$/, '');
  }, [text, refs, cites, As]);

  const macroVersion = useMemo(() => JSON.stringify(macros || {}), [macros]);
  useHtml(ref, html, macroVersion);
  // Activity reactivates effects; the typesetter guard preserves unchanged math.
  useEffect(() => {
    if (ref.current) typesetMath(ref.current, macros);
  });

  return (
    <As
      ref={ref as never}
      id={id}
      className={className}
      onClick={(e: React.MouseEvent) => {
        const t = e.target as HTMLElement;
        const refEl = t.closest('.ref[data-id]') as HTMLElement | null;
        if (refEl && onNavigate) return onNavigate(refEl.dataset.id!);
        // a chapter/section/equation ref: no node id, so the locator is
        // "<chapter index>:<element id>" (see latex.ts's xref)
        const locEl = t.closest('.ref[data-loc]') as HTMLElement | null;
        if (locEl && onNavigate) return onNavigate(locEl.dataset.loc!);
        const citeEl = t.closest('.cite[data-cite]') as HTMLElement | null;
        if (citeEl && onCite) return onCite(citeEl.dataset.cite!);
      }}
    />
  );
}
