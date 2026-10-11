import { useEffect, useRef } from 'react';
import { ADSENSE_CLIENT, ADSENSE_SLOT, SUPPORT_URL } from '../lib/support';

/** A small "support the game" link. Renders nothing when VITE_SUPPORT_URL is not set. */
export function SupportLink() {
  if (!SUPPORT_URL) return null;
  return (
    <p className="muted center-text">
      TypeRush is free. If you enjoy it, you can{' '}
      <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">
        support the game
      </a>
      .
    </p>
  );
}

/** One AdSense banner. Renders nothing unless both AdSense ids are configured. Never shown during a race. */
export function AdSlot() {
  const done = useRef(false);
  useEffect(() => {
    if (!ADSENSE_CLIENT || !ADSENSE_SLOT || done.current) return;
    done.current = true;
    const id = 'adsense-script';
    if (!document.getElementById(id)) {
      const s = document.createElement('script');
      s.id = id;
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
      document.head.appendChild(s);
    }
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] };
      (w.adsbygoogle = w.adsbygoogle || []).push({});
    } catch {
      /* ad blockers and consent tools may stop this: that is fine */
    }
  }, []);
  if (!ADSENSE_CLIENT || !ADSENSE_SLOT) return null;
  return (
    <div className="ad-slot" aria-label="Advertisement">
      <ins className="adsbygoogle" style={{ display: 'block' }} data-ad-client={ADSENSE_CLIENT} data-ad-slot={ADSENSE_SLOT} data-ad-format="auto" data-full-width-responsive="true" />
    </div>
  );
}
