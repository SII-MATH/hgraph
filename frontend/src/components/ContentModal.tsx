import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

/** Native overlay: keep the reading view mounted, lock scrolling, restore focus. */
export function ContentModal({ title, onClose, children, chrome = true }: {
  title: string; onClose: () => void; children: ReactNode; chrome?: boolean;
}) {
  const ref = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus({ preventScroll: true });
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        onClose();
      }
      if (event.key === 'Tab') {
        const targets = Array.from(ref.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input, select, textarea, iframe, [tabindex="0"]',
        ) || []).filter((element) => element.getClientRects().length);
        const first = targets[0], last = targets.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }
    }
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', keydown);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [onClose]);
  return (
    <section ref={ref} className="graph-modal content-modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
      {chrome && <div className="gm-bar"><h2>{title}</h2><span className="sp" />
        <button type="button" className="gm-btn" onClick={onClose} aria-label={`Close ${title}`} title={`Close ${title}`}>
          <X size={17} aria-hidden="true" />
        </button>
      </div>}
      {children}
    </section>
  );
}
