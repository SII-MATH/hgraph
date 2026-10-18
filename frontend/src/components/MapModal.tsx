import { useEffect, useMemo, useRef } from 'react';
import type { ProjectData } from '../types';
import { buildMapData } from '../mapData';
import { CUSTOM_PAGE_CHANNEL, CUSTOM_PAGE_VERSION, isCustomPageMessage } from '../customPage';
import { ContentModal } from './ContentModal';

export function MapModal({ data, root, title, onClose, onNavigate }: {
  data: ProjectData; root: string; title: string;
  onClose: () => void; onNavigate: (locator: string) => void;
}) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const result = useMemo(() => {
    try { return { data: buildMapData(data, root), error: null }; }
    catch (error) { return { data: null, error: String(error) }; }
  }, [data, root]);
  useEffect(() => {
    function message(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== ref.current?.contentWindow
        || !isCustomPageMessage(event.data)) return;
      if (event.data.type === 'close') onClose();
      if (event.data.type === 'navigate') onNavigate(event.data.locator!);
      if (event.data.type === 'ready' && result.data) {
        ref.current?.contentWindow?.postMessage({ channel: CUSTOM_PAGE_CHANNEL,
          version: CUSTOM_PAGE_VERSION, type: 'map-data', data: result.data }, window.location.origin);
      }
    }
    window.addEventListener('message', message);
    return () => window.removeEventListener('message', message);
  }, [result, onClose, onNavigate]);
  return (
    <ContentModal title={title} onClose={onClose} chrome={!!result.error}>
      {result.error ? <div className="page-error">Couldn't load the blueprint map: {result.error}</div>
        : <iframe ref={ref} title={title} className="native-map-frame"
          src={new URL('blueprint-map/renderer.html?native=1', document.baseURI).href} />}
    </ContentModal>
  );
}
