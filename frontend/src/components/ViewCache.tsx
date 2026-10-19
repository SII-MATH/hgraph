import { Activity, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { retainViews } from '../viewCache';

function CachedView({ active, restoreScroll, children }: {
  active: boolean; restoreScroll: boolean; children: ReactNode;
}) {
  const position = useRef({ x: 0, y: 0 });
  // Activity destroys effects when hidden while retaining DOM and local state.
  // Scroll listeners and modal keyboard handlers therefore run only when visible.
  useLayoutEffect(() => {
    if (!restoreScroll) return;
    window.scrollTo(position.current.x, position.current.y);
    const save = () => { position.current = { x: scrollX, y: scrollY }; };
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, [restoreScroll]);
  return <div data-view-active={active ? 'true' : 'false'}>{children}</div>;
}

/** Lazy, bounded reuse of recently visited pages, including iframe documents.
 * Keep key ordering stable: moving an iframe's DOM ancestor can reload it.
 * Scope this component to a project/document; no browser storage or stale cache.
 */
export function ViewCache({ activeKey, capacity = 6, restoreScroll = true, children }: {
  activeKey: string | null; capacity?: number; restoreScroll?: boolean;
  children: (key: string) => ReactNode;
}) {
  const [recent, setRecent] = useState<string[]>([]);
  const next = retainViews(recent, activeKey, capacity);
  if (next.length !== recent.length || next.some((key, index) => key !== recent[index])) setRecent(next);
  return next.slice().sort().map(key => (
    <Activity key={key} mode={key === activeKey ? 'visible' : 'hidden'}>
      <CachedView active={key === activeKey} restoreScroll={restoreScroll}>{children(key)}</CachedView>
    </Activity>
  ));
}
