/* hgraph custom-page lifecycle API, protocol version 1. Same-origin embeds only. */
(() => {
  'use strict';
  const channel = 'hgraph:custom-page';
  const version = 1;
  function send(type, detail = {}) {
    if (window.parent !== window) {
      window.parent.postMessage({ channel, version, type, ...detail }, location.origin);
    } else {
      window.dispatchEvent(new CustomEvent(`hgraph:${type}`, { detail }));
    }
  }
  window.hgraph = Object.freeze({
    version,
    close: () => send('close'),
    navigate: (locator) => {
      if (typeof locator !== 'string' || !locator) throw new TypeError('hgraph.navigate needs a statement id, label or locator');
      send('navigate', { locator });
    },
    ready: () => send('ready'),
  });
  window.addEventListener('keydown', (event) => {
    if (window.parent !== window && event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault(); window.hgraph.close();
    }
  });
})();
