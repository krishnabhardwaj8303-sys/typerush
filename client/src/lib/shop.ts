// Catalog of the cosmetic items you can unlock with coins. Pure data, no React.
// Cars live in the shared package (the server must know their ids); skins and trails are
// drawn only on your own screen, so they live here in the client.

export type SkinId = 'plain' | 'stripes' | 'flames' | 'checker' | 'stars' | 'carbon' | 'gold';
export type TrailId = 'none' | 'smoke' | 'sparks' | 'bubbles' | 'fire' | 'neon' | 'rainbow';

export interface ShopItem<T extends string> {
  id: T;
  name: string;
  price: number;
  blurb: string;
}

export const SKINS: ShopItem<SkinId>[] = [
  { id: 'plain', name: 'Classic', price: 0, blurb: 'The original paint job.' },
  { id: 'stripes', name: 'Racing Stripes', price: 90, blurb: 'Two white stripes down the middle.' },
  { id: 'checker', name: 'Checkered', price: 120, blurb: 'A chequered flag band.' },
  { id: 'flames', name: 'Hot Flames', price: 140, blurb: 'Flames licking along the sides.' },
  { id: 'stars', name: 'Starfield', price: 160, blurb: 'A sky full of tiny stars.' },
  { id: 'carbon', name: 'Carbon Fibre', price: 200, blurb: 'Dark woven carbon look.' },
  { id: 'gold', name: 'Pure Gold', price: 300, blurb: 'Shiny gold. Pure bragging rights.' },
];

export const TRAILS: ShopItem<TrailId>[] = [
  { id: 'none', name: 'No trail', price: 0, blurb: 'Clean and simple.' },
  { id: 'smoke', name: 'Tyre Smoke', price: 80, blurb: 'Puffs of grey smoke.' },
  { id: 'sparks', name: 'Sparks', price: 100, blurb: 'Glittering yellow sparks.' },
  { id: 'bubbles', name: 'Bubbles', price: 120, blurb: 'Floaty soap bubbles.' },
  { id: 'fire', name: 'Fire Trail', price: 160, blurb: 'A blazing path behind you.' },
  { id: 'neon', name: 'Neon Streak', price: 180, blurb: 'A glowing cyan and pink streak.' },
  { id: 'rainbow', name: 'Rainbow Road', price: 220, blurb: 'Every colour of the rainbow.' },
];

export const SKIN_IDS = SKINS.map((s) => s.id);
export const TRAIL_IDS = TRAILS.map((t) => t.id);

export function isSkinId(value: unknown): value is SkinId {
  return typeof value === 'string' && (SKIN_IDS as string[]).includes(value);
}

export function isTrailId(value: unknown): value is TrailId {
  return typeof value === 'string' && (TRAIL_IDS as string[]).includes(value);
}

export const FREE_SKINS: SkinId[] = SKINS.filter((s) => s.price === 0).map((s) => s.id);
export const FREE_TRAILS: TrailId[] = TRAILS.filter((t) => t.price === 0).map((t) => t.id);
