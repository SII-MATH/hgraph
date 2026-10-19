/** A document-local LRU. Nothing persists across reloads or project roots. */
export function retainViews(keys: readonly string[], active: string | null, capacity: number): string[] {
  if (!active) return keys.slice();
  return [...keys.filter(key => key !== active), active].slice(-Math.max(1, capacity));
}

/** Cached chapters/search results may share anchors; only navigate visible DOM. */
export function visibleElementById(id: string): HTMLElement | null {
  const first = document.getElementById(id);
  if (first?.getClientRects().length) return first;
  return Array.from(document.querySelectorAll<HTMLElement>('#' + CSS.escape(id)))
    .find(element => element.getClientRects().length > 0) ?? null;
}
