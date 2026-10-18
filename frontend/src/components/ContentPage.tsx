import { useRef, useEffect } from 'react';
import { typesetMath } from '../typeset';
import { isCustomPageMessage, ownsMessage } from '../customPage';

/** A configured content page — a landing or blueprint custom tab, or the
 *  landing overview. The HTML is authored by the site owner (markdown converted
 *  by `hgraph.site._md_to_html`, or `.html` used verbatim) and trusted the same
 *  way the overview and footer already are; it is injected as-is and then KaTeX-
 *  typeset so `$…$` math renders. Extracted from Landing's former inner
 *  `Overview` so the landing page and ProjectView share one renderer.
 *
 *  No dependency array (same React-19 innerHTML-reset caveat as Tex.tsx);
 *  `typesetMath`'s guard makes the per-commit call O(1) when nothing changed. */
export function ContentPage({ html, className = 'overview', onClose, onNavigate }: {
  html: string; className?: string; onClose?: () => void; onNavigate?: (locator: string) => void;
}) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (ref.current) typesetMath(ref.current);
  });
  useEffect(() => {
    if (!onClose && !onNavigate) return;
    function message(event: MessageEvent) {
      if (!ref.current || !ownsMessage(ref.current, event) || !isCustomPageMessage(event.data)) return;
      if (event.data.type === 'close') onClose?.();
      if (event.data.type === 'navigate') onNavigate?.(event.data.locator!);
    }
    function close(event: Event) {
      // Inline content can use a bubbling event, or the SDK's window event.
      if (event.target === window || event.target instanceof Node && ref.current?.contains(event.target)) onClose?.();
    }
    function navigate(event: Event) {
      const locator = (event as CustomEvent<{locator?: unknown}>).detail?.locator;
      if (event.target === window && typeof locator === 'string' && locator) onNavigate?.(locator);
    }
    function click(event: MouseEvent) {
      if (event.target instanceof Element && event.target.closest('[data-hgraph-close]')) {
        event.preventDefault(); onClose?.();
      }
    }
    const element = ref.current;
    window.addEventListener('message', message);
    window.addEventListener('hgraph:close', close);
    window.addEventListener('hgraph:navigate', navigate);
    element?.addEventListener('click', click);
    return () => {
      window.removeEventListener('message', message);
      window.removeEventListener('hgraph:close', close);
      window.removeEventListener('hgraph:navigate', navigate);
      element?.removeEventListener('click', click);
    };
  }, [onClose, onNavigate]);
  return <section className={className} ref={ref as never} dangerouslySetInnerHTML={{ __html: html }} />;
}
