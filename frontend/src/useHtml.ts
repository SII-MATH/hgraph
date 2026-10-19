import { useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';

/** Preserve typeset math/iframes until source, element, or rendering context changes. */
export function useHtml(ref: RefObject<HTMLElement | null>, html: string, version?: unknown): void {
  const previous = useRef<{ element: HTMLElement; html: string; version: unknown } | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    const last = previous.current;
    if (element && (last?.element !== element || last.html !== html || last.version !== version)) {
      element.innerHTML = html;
      previous.current = { element, html, version };
    }
  });
}
