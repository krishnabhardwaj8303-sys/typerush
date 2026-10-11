// Optional money-making hooks. Both are OFF unless you set an environment variable when building
// the client (Cloudflare: Settings > Variables and Secrets > Build variables).
//  - VITE_SUPPORT_URL: a link where people can tip you (UPI page, Ko-fi, Buy Me a Coffee ...).
//  - VITE_ADSENSE_CLIENT + VITE_ADSENSE_SLOT: Google AdSense ids (only after Google approves your site).

export const SUPPORT_URL: string | null = safeUrl(import.meta.env.VITE_SUPPORT_URL);
export const ADSENSE_CLIENT: string | null = pick(import.meta.env.VITE_ADSENSE_CLIENT, /^ca-pub-\d{6,20}$/);
export const ADSENSE_SLOT: string | null = pick(import.meta.env.VITE_ADSENSE_SLOT, /^\d{4,20}$/);

function pick(value: string | undefined, pattern: RegExp): string | null {
  const v = (value ?? '').trim();
  return pattern.test(v) ? v : null;
}

function safeUrl(value: string | undefined): string | null {
  try {
    const url = new URL((value ?? '').trim());
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
