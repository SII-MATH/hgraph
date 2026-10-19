import { useEffect, useRef } from 'react';
import { useHtml } from '../useHtml';
import { typesetMath } from '../typeset';

/** Trusted, already escaped native HTML with stable formula DOM. */
export function Html({ html }: { html: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  useHtml(ref, html);
  useEffect(() => { if (ref.current) typesetMath(ref.current); });
  return <span ref={ref} />;
}
