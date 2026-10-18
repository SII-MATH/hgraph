/** Public versioned lifecycle protocol, also used by hgraph-custom-page.js. */
export const CUSTOM_PAGE_CHANNEL = 'hgraph:custom-page';
export const CUSTOM_PAGE_VERSION = 1;

export interface CustomPageApi {
  readonly version: 1;
  close(): void;
  navigate(locator: string): void;
  ready(): void;
}

declare global {
  interface Window { hgraph: CustomPageApi }
}

export interface CustomPageMessage {
  channel: typeof CUSTOM_PAGE_CHANNEL;
  version: typeof CUSTOM_PAGE_VERSION;
  type: 'close' | 'navigate' | 'ready';
  locator?: string;
}

export function isCustomPageMessage(value: unknown): value is CustomPageMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<CustomPageMessage>;
  return message.channel === CUSTOM_PAGE_CHANNEL && message.version === CUSTOM_PAGE_VERSION
    && (message.type === 'close' || message.type === 'ready'
      || message.type === 'navigate' && typeof message.locator === 'string' && message.locator.length > 0);
}

/** Only the iframe actually hosted by this content container may command it. */
export function ownsMessage(container: HTMLElement, event: MessageEvent): boolean {
  return event.origin === window.location.origin
    && Array.from(container.querySelectorAll('iframe')).some((frame) => frame.contentWindow === event.source);
}
