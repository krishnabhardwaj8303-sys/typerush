import {
  CARS,
  TRACK_THEME_NAMES,
  createRng,
  getLevel,
  type CarDef,
  type CarId,
  type Difficulty,
  type Rng,
} from '@typerush/shared';

export interface RenderCar {
  id: string;
  name: string;
  car: CarId;
  /** Displayed progress 0..1 (already smoothed by the caller). */
  progress: number;
  /** 0..1, drives wheel spin, flames and speed lines. */
  speed: number;
  isYou: boolean;
  finished: boolean;
  /** Finishing position once known. */
  position?: number | null;
  dnf?: boolean;
  offline?: boolean;
}

export interface RenderState {
  cars: RenderCar[];
  /** Seconds, only used for animation phases. */
  time: number;
  /** Distance the world has scrolled (px). */
  scroll: number;
  reduceMotion: boolean;
  /** Which track to draw. Leave undefined for a default track. */
  track?: TrackSpec;
}

export const emptyRenderState = (): RenderState => ({ cars: [], time: 0, scroll: 0, reduceMotion: false });

const CAR_BY_ID = new Map<CarId, CarDef>(CARS.map((c) => [c.id, c]));

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Draws a car centred on (cx, cy) facing right. `w` is the car length in px. */
export function drawCar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  def: CarDef,
  opts: { wheelAngle?: number; flame?: number; time?: number; shadow?: boolean } = {},
) {
  const { wheelAngle = 0, flame = 0, time = 0, shadow = true } = opts;
  const h = w * 0.38;
  const left = cx - w / 2;
  const bodyTop = cy - h * 0.55;
  const wheelR = w * 0.095;
  const wheelY = cy + h * 0.32;

  ctx.save();
  if (shadow) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + h * 0.48, w * 0.46, h * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Nitro flame
  if (flame > 0.05) {
    const len = w * (0.22 + flame * 0.35) * (0.85 + 0.15 * Math.sin(time * 40));
    const g = ctx.createLinearGradient(left, 0, left - len, 0);
    g.addColorStop(0, 'rgba(255,240,150,0.95)');
    g.addColorStop(0.45, 'rgba(255,140,40,0.8)');
    g.addColorStop(1, 'rgba(255,60,120,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(left + 2, cy + h * 0.05);
    ctx.lineTo(left - len, cy + h * 0.17);
    ctx.lineTo(left + 2, cy + h * 0.3);
    ctx.closePath();
    ctx.fill();
  }

  // Body silhouette depends on the shape.
  const bodyH = h * 0.55;
  const bodyY = bodyTop + h * 0.42;
  ctx.fillStyle = def.body;
  rr(ctx, left, bodyY, w, bodyH, h * 0.2);
  ctx.fill();

  // Cabin
  ctx.beginPath();
  if (def.shape === 'sedan') {
    ctx.moveTo(left + w * 0.2, bodyY + 1);
    ctx.lineTo(left + w * 0.3, bodyTop + h * 0.04);
    ctx.lineTo(left + w * 0.66, bodyTop + h * 0.04);
    ctx.lineTo(left + w * 0.8, bodyY + 1);
  } else if (def.shape === 'coupe') {
    ctx.moveTo(left + w * 0.24, bodyY + 1);
    ctx.lineTo(left + w * 0.4, bodyTop + h * 0.1);
    ctx.lineTo(left + w * 0.62, bodyTop + h * 0.1);
    ctx.lineTo(left + w * 0.84, bodyY + 1);
  } else {
    ctx.moveTo(left + w * 0.14, bodyY + 1);
    ctx.lineTo(left + w * 0.2, bodyTop);
    ctx.lineTo(left + w * 0.6, bodyTop);
    ctx.lineTo(left + w * 0.8, bodyY + 1);
  }
  ctx.closePath();
  ctx.fillStyle = def.body;
  ctx.fill();
  ctx.fillStyle = '#bfe3ff';
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  const inset = h * 0.07;
  if (def.shape === 'sedan') {
    ctx.moveTo(left + w * 0.25, bodyY - inset * 0.2);
    ctx.lineTo(left + w * 0.33, bodyTop + h * 0.1);
    ctx.lineTo(left + w * 0.63, bodyTop + h * 0.1);
    ctx.lineTo(left + w * 0.74, bodyY - inset * 0.2);
  } else if (def.shape === 'coupe') {
    ctx.moveTo(left + w * 0.3, bodyY - inset * 0.2);
    ctx.lineTo(left + w * 0.42, bodyTop + h * 0.16);
    ctx.lineTo(left + w * 0.6, bodyTop + h * 0.16);
    ctx.lineTo(left + w * 0.77, bodyY - inset * 0.2);
  } else {
    ctx.moveTo(left + w * 0.2, bodyY - inset * 0.2);
    ctx.lineTo(left + w * 0.25, bodyTop + h * 0.07);
    ctx.lineTo(left + w * 0.58, bodyTop + h * 0.07);
    ctx.lineTo(left + w * 0.73, bodyY - inset * 0.2);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  // Accent stripe, lights, spoiler
  ctx.fillStyle = def.accent;
  rr(ctx, left + w * 0.06, bodyY + bodyH * 0.38, w * 0.88, bodyH * 0.16, 2);
  ctx.fill();
  ctx.fillStyle = '#fff7c2';
  rr(ctx, left + w - w * 0.07, bodyY + bodyH * 0.12, w * 0.06, bodyH * 0.28, 2);
  ctx.fill();
  ctx.fillStyle = '#ff5a5a';
  rr(ctx, left + 1, bodyY + bodyH * 0.12, w * 0.05, bodyH * 0.28, 2);
  ctx.fill();
  ctx.fillStyle = def.accent;
  ctx.fillRect(left + w * 0.02, bodyTop + h * 0.34, w * 0.1, h * 0.05);

  // Headlight beam
  const beam = ctx.createLinearGradient(left + w, 0, left + w * 1.35, 0);
  beam.addColorStop(0, 'rgba(255,247,194,0.28)');
  beam.addColorStop(1, 'rgba(255,247,194,0)');
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(left + w, bodyY + bodyH * 0.2);
  ctx.lineTo(left + w * 1.35, bodyY - bodyH * 0.2);
  ctx.lineTo(left + w * 1.35, bodyY + bodyH * 0.7);
  ctx.closePath();
  ctx.fill();

  // Wheels
  for (const wx of [left + w * 0.24, left + w * 0.76]) {
    ctx.fillStyle = '#10131f';
    ctx.beginPath();
    ctx.arc(wx, wheelY, wheelR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d7def5';
    ctx.lineWidth = Math.max(1.5, wheelR * 0.18);
    ctx.beginPath();
    ctx.arc(wx, wheelY, wheelR * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = Math.max(1, wheelR * 0.13);
    for (let i = 0; i < 4; i++) {
      const a = wheelAngle + (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(wx, wheelY);
      ctx.lineTo(wx + Math.cos(a) * wheelR * 0.62, wheelY + Math.sin(a) * wheelR * 0.62);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ============================================================================
// Winding top-down tracks
// ============================================================================

export interface TrackSpec {
  /** Index into TRACK_THEME_NAMES. */
  theme: number;
  /** Random seed: same seed + same canvas size = identical track on every device. */
  seed: number;
  /** Number of U-turns (rows - 1). The renderer reduces it if the canvas is too small. */
  turns: number;
}

const DEFAULT_TRACK: TrackSpec = { theme: 0, seed: 1, turns: 2 };
export const THEME_COUNT = TRACK_THEME_NAMES.length;

export function hashString(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Track for a campaign level: fixed theme, fixed layout. */
export function levelTrack(levelId: number): TrackSpec {
  const level = getLevel(levelId);
  if (!level) return DEFAULT_TRACK;
  return { theme: level.theme, seed: level.id * 7919 + 13, turns: level.turns };
}

/** Track for practice / online races: derived from a seed (a number or e.g. the room code). */
export function seededTrack(seed: number | string, difficulty: Difficulty): TrackSpec {
  const n = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  const turns = { easy: 2, medium: 3, hard: 4, expert: 5 }[difficulty];
  return { theme: n % THEME_COUNT, seed: n, turns };
}

type Decor =
  | 'building'
  | 'cactus'
  | 'tree'
  | 'umbrella'
  | 'palm'
  | 'pool'
  | 'pine'
  | 'neon'
  | 'rock'
  | 'lava'
  | 'container'
  | 'crater';
type Weather = 'none' | 'snow' | 'rain' | 'embers';

interface Theme {
  ground: string;
  speck: string;
  asphalt: string;
  curbA: string;
  curbB: string;
  decor: Decor[];
  weather: Weather;
  stars: boolean;
}

const THEMES: Theme[] = [
  { ground: '#1d1546', speck: '#2a1f61', asphalt: '#2b3350', curbA: '#e5384f', curbB: '#f4f6ff', decor: ['building'], weather: 'none', stars: false },
  { ground: '#d9a65a', speck: '#c8934a', asphalt: '#4a4338', curbA: '#b5472e', curbB: '#f6e7c8', decor: ['cactus', 'cactus', 'rock'], weather: 'none', stars: false },
  { ground: '#14532d', speck: '#1b6b3a', asphalt: '#3a3f3c', curbA: '#e5384f', curbB: '#f4f6ff', decor: ['tree'], weather: 'none', stars: false },
  { ground: '#eed9a0', speck: '#e0c786', asphalt: '#3c4658', curbA: '#2f7bff', curbB: '#ffffff', decor: ['umbrella', 'palm', 'pool'], weather: 'none', stars: false },
  { ground: '#dbe9f5', speck: '#c3d8ec', asphalt: '#4a5568', curbA: '#2f7bff', curbB: '#ffffff', decor: ['pine', 'pine', 'rock'], weather: 'snow', stars: false },
  { ground: '#070b1e', speck: '#101838', asphalt: '#0f1428', curbA: '#22d3ee', curbB: '#ff3ea5', decor: ['neon'], weather: 'none', stars: true },
  { ground: '#5f6b5a', speck: '#6d7a67', asphalt: '#3b3f46', curbA: '#ffc233', curbB: '#1d2433', decor: ['rock', 'rock', 'pine'], weather: 'none', stars: false },
  { ground: '#2a0f0a', speck: '#3b1810', asphalt: '#2b2626', curbA: '#ff7a1a', curbB: '#ffe08a', decor: ['lava', 'rock'], weather: 'embers', stars: false },
  { ground: '#1f2a3a', speck: '#283750', asphalt: '#2a3140', curbA: '#ffc233', curbB: '#1d2433', decor: ['container', 'container', 'pool'], weather: 'rain', stars: false },
  { ground: '#12121f', speck: '#1c1c30', asphalt: '#4b4f5c', curbA: '#34d399', curbB: '#0b3d33', decor: ['crater'], weather: 'none', stars: true },
];

interface Pt {
  x: number;
  y: number;
}

export interface Geometry {
  pts: Pt[];
  cum: number[];
  length: number;
  roadW: number;
  laneW: number;
  lanes: number;
  rows: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function smooth01(t: number): number {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

/**
 * Builds the centre line of the road: a serpentine of straight (slightly wavy) rows joined by
 * semicircular U-turns. Pure function of (spec, canvas size, lane count).
 */
export function buildGeometry(spec: TrackSpec, w: number, h: number, lanes: number): Geometry {
  const rng = createRng(spec.seed);
  const laneW = clamp(Math.min(w, h) * 0.05, 15, 28);
  const roadW = laneW * lanes;
  const margin = 18;
  const top = margin + roadW / 2 + 8;
  const bottom = h - margin - roadW / 2 - 8;
  const maxRows = Math.max(2, Math.floor((bottom - top) / (roadW + 22)) + 1);
  const rows = clamp(spec.turns + 1, 2, maxRows);
  const spacing = (bottom - top) / (rows - 1);
  const radius = spacing / 2;

  const xMaxRight = w - margin - roadW / 2 - radius - 8;
  const xMinLeft = margin + roadW / 2 + radius + 8;
  const range = Math.max(10, xMaxRight - xMinLeft);

  // x of every U-turn: even turns on the right, odd turns on the left.
  const turnX: number[] = [];
  for (let k = 0; k < rows - 1; k++) {
    turnX.push(k % 2 === 0 ? xMaxRight - rng() * 0.14 * range : xMinLeft + rng() * 0.14 * range);
  }
  const startX = margin + roadW / 2 + 14;
  const endX = (rows - 1) % 2 === 0 ? w - margin - roadW / 2 - 14 : margin + roadW / 2 + 14;

  const pts: Pt[] = [];
  const push = (x: number, y: number) => {
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(last.x - x, last.y - y) > 0.5) pts.push({ x, y });
  };

  for (let r = 0; r < rows; r++) {
    const y = top + r * spacing;
    const xa = r === 0 ? startX : turnX[r - 1];
    const xb = r === rows - 1 ? endX : turnX[r];
    const len = Math.abs(xb - xa);
    const dir = xb >= xa ? 1 : -1;
    const amp = Math.min(18, Math.max(0, (spacing - roadW) / 3.4)) * (0.45 + 0.55 * rng());
    const wave = 170 + rng() * 150;
    const phase = rng() * Math.PI * 2;
    const steps = Math.max(2, Math.ceil(len / 5));
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const taper = smooth01(Math.min(u, 1 - u) / 0.16);
      const x = xa + dir * len * u;
      push(x, y + amp * taper * Math.sin((2 * Math.PI * (u * len)) / wave + phase));
    }
    if (r < rows - 1) {
      const cx = turnX[r];
      const cy = y + spacing / 2;
      const right = r % 2 === 0;
      const arcSteps = Math.max(8, Math.ceil((Math.PI * radius) / 5));
      for (let i = 1; i <= arcSteps; i++) {
        const theta = right ? -Math.PI / 2 + (Math.PI * i) / arcSteps : -Math.PI / 2 - (Math.PI * i) / arcSteps;
        push(cx + radius * Math.cos(theta), cy + radius * Math.sin(theta));
      }
    }
  }

  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  return { pts, cum, length: cum[cum.length - 1], roadW, laneW, lanes, rows };
}

function pointAtDistance(g: Geometry, distance: number): Pt {
  const d = clamp(distance, 0, g.length);
  let lo = 0;
  let hi = g.cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (g.cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const span = g.cum[hi] - g.cum[lo] || 1;
  const f = (d - g.cum[lo]) / span;
  return { x: g.pts[lo].x + (g.pts[hi].x - g.pts[lo].x) * f, y: g.pts[lo].y + (g.pts[hi].y - g.pts[lo].y) * f };
}

/** Position and heading of a car that is `distance` px along the road in lane `lane`. */
export function carPose(g: Geometry, distance: number, lane: number): { x: number; y: number; angle: number } {
  const a = pointAtDistance(g, distance - 9);
  const b = pointAtDistance(g, distance + 9);
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const p = pointAtDistance(g, distance);
  const offset = (lane - (g.lanes - 1) / 2) * g.laneW;
  return { x: p.x - Math.sin(angle) * offset, y: p.y + Math.cos(angle) * offset, angle };
}

function carLength(g: Geometry): number {
  return clamp(g.laneW * 1.85, 26, 46);
}

function distanceForProgress(g: Geometry, progress: number): number {
  const len = carLength(g);
  const from = len * 0.7;
  const to = g.length - len * 0.3;
  return from + (to - from) * clamp(progress, 0, 1);
}

// ---------------------------------------------------------------- static scene

function strokePath(c: CanvasRenderingContext2D, pts: Pt[]) {
  c.beginPath();
  pts.forEach((p, i) => (i === 0 ? c.moveTo(p.x, p.y) : c.lineTo(p.x, p.y)));
}

function offsetPath(g: Geometry, offset: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < g.pts.length; i++) {
    const a = g.pts[Math.max(0, i - 1)];
    const b = g.pts[Math.min(g.pts.length - 1, i + 1)];
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    out.push({ x: g.pts[i].x - Math.sin(ang) * offset, y: g.pts[i].y + Math.cos(ang) * offset });
  }
  return out;
}

function distanceToRoad(g: Geometry, x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < g.pts.length; i += 2) {
    const d = Math.hypot(g.pts[i].x - x, g.pts[i].y - y);
    if (d < best) best = d;
  }
  return best;
}

function drawDecor(c: CanvasRenderingContext2D, kind: Decor, x: number, y: number, s: number, rng: Rng) {
  c.save();
  c.translate(x, y);
  switch (kind) {
    case 'building': {
      const colors = ['#3b2a63', '#4a2f73', '#7a3e8f', '#2e2457', '#5b3a8c'];
      const bw = s * 1.5;
      const bh = s * 1.1;
      c.rotate(rng() < 0.5 ? 0 : Math.PI / 2);
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fillRect(-bw / 2 + 4, -bh / 2 + 5, bw, bh);
      c.fillStyle = colors[Math.floor(rng() * colors.length)];
      c.fillRect(-bw / 2, -bh / 2, bw, bh);
      c.fillStyle = 'rgba(255,225,140,0.75)';
      for (let i = 0; i < 6; i++) c.fillRect(-bw / 2 + 4 + rng() * (bw - 10), -bh / 2 + 4 + rng() * (bh - 10), 3, 3);
      break;
    }
    case 'cactus': {
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.beginPath();
      c.ellipse(3, 4, s * 0.5, s * 0.35, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#2e7d32';
      rr(c, -s * 0.18, -s * 0.7, s * 0.36, s * 1.4, s * 0.18);
      c.fill();
      rr(c, -s * 0.62, -s * 0.2, s * 0.5, s * 0.24, s * 0.12);
      c.fill();
      rr(c, s * 0.12, -s * 0.45, s * 0.5, s * 0.24, s * 0.12);
      c.fill();
      break;
    }
    case 'tree': {
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.beginPath();
      c.arc(3, 4, s, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#0f3d22';
      c.beginPath();
      c.arc(0, 0, s, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#1f7a45';
      c.beginPath();
      c.arc(-s * 0.15, -s * 0.15, s * 0.7, 0, Math.PI * 2);
      c.fill();
      break;
    }
    case 'umbrella': {
      for (let i = 0; i < 8; i++) {
        c.fillStyle = i % 2 === 0 ? '#e5384f' : '#ffffff';
        c.beginPath();
        c.moveTo(0, 0);
        c.arc(0, 0, s * 0.9, (i * Math.PI) / 4, ((i + 1) * Math.PI) / 4);
        c.closePath();
        c.fill();
      }
      break;
    }
    case 'palm': {
      c.fillStyle = '#1f9d55';
      for (let i = 0; i < 7; i++) {
        c.save();
        c.rotate((i * Math.PI * 2) / 7);
        c.beginPath();
        c.ellipse(s * 0.55, 0, s * 0.6, s * 0.18, 0, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
      c.fillStyle = '#7a4a22';
      c.beginPath();
      c.arc(0, 0, s * 0.2, 0, Math.PI * 2);
      c.fill();
      break;
    }
    case 'pool': {
      c.fillStyle = '#2a7fc2';
      c.beginPath();
      c.ellipse(0, 0, s * 1.5, s * 0.95, rng() * 3, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.5)';
      c.lineWidth = 2;
      c.stroke();
      break;
    }
    case 'pine': {
      c.fillStyle = 'rgba(0,0,0,0.2)';
      c.beginPath();
      c.arc(3, 4, s, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#1f5a40';
      c.beginPath();
      c.arc(0, 0, s, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#2f7a57';
      c.beginPath();
      c.arc(0, 0, s * 0.62, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#f4f9ff';
      c.beginPath();
      c.arc(-s * 0.1, -s * 0.1, s * 0.3, 0, Math.PI * 2);
      c.fill();
      break;
    }
    case 'neon': {
      const color = rng() < 0.5 ? '#22d3ee' : '#ff3ea5';
      c.rotate(rng() * Math.PI);
      c.shadowColor = color;
      c.shadowBlur = 14;
      c.strokeStyle = color;
      c.lineWidth = 3;
      c.strokeRect(-s * 0.7, -s * 0.7, s * 1.4, s * 1.4);
      c.lineWidth = 1.5;
      c.strokeRect(-s * 0.35, -s * 0.35, s * 0.7, s * 0.7);
      break;
    }
    case 'rock': {
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.beginPath();
      c.ellipse(3, 4, s * 0.9, s * 0.7, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#7b8794';
      c.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI * 2) / 8;
        const rad = s * (0.65 + rng() * 0.4);
        const px = Math.cos(a) * rad;
        const py = Math.sin(a) * rad;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.closePath();
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.25)';
      c.beginPath();
      c.arc(-s * 0.2, -s * 0.2, s * 0.28, 0, Math.PI * 2);
      c.fill();
      break;
    }
    case 'lava': {
      c.shadowColor = '#ff7a1a';
      c.shadowBlur = 18;
      c.fillStyle = '#e8501a';
      c.beginPath();
      c.ellipse(0, 0, s * 1.5, s * 0.9, rng() * 3, 0, Math.PI * 2);
      c.fill();
      c.shadowBlur = 0;
      c.fillStyle = '#ffd166';
      c.beginPath();
      c.ellipse(0, 0, s * 0.8, s * 0.4, 0, 0, Math.PI * 2);
      c.fill();
      break;
    }
    case 'container': {
      const colors = ['#d1495b', '#2e86ab', '#edae49', '#66a182'];
      const cw = s * 2.3;
      const ch = s * 0.95;
      c.rotate(rng() < 0.5 ? 0 : Math.PI / 2);
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fillRect(-cw / 2 + 3, -ch / 2 + 4, cw, ch);
      c.fillStyle = colors[Math.floor(rng() * colors.length)];
      c.fillRect(-cw / 2, -ch / 2, cw, ch);
      c.strokeStyle = 'rgba(0,0,0,0.3)';
      c.lineWidth = 1.5;
      for (let i = 1; i < 5; i++) {
        c.beginPath();
        c.moveTo(-cw / 2 + (cw * i) / 5, -ch / 2);
        c.lineTo(-cw / 2 + (cw * i) / 5, ch / 2);
        c.stroke();
      }
      break;
    }
    case 'crater': {
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.beginPath();
      c.arc(0, 0, s, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = 'rgba(200,205,225,0.45)';
      c.lineWidth = 2.5;
      c.beginPath();
      c.arc(0, 0, s, 0, Math.PI * 2);
      c.stroke();
      break;
    }
  }
  c.restore();
}

function renderScene(c: CanvasRenderingContext2D, g: Geometry, spec: TrackSpec, w: number, h: number) {
  const theme = THEMES[spec.theme % THEMES.length];
  const rng = createRng(spec.seed * 31 + 7);

  // Ground + texture
  c.fillStyle = theme.ground;
  c.fillRect(0, 0, w, h);
  c.fillStyle = theme.speck;
  for (let i = 0; i < 160; i++) {
    const r = 2 + rng() * 5;
    c.beginPath();
    c.arc(rng() * w, rng() * h, r, 0, Math.PI * 2);
    c.fill();
  }
  if (theme.stars) {
    c.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 70; i++) c.fillRect(rng() * w, rng() * h, 1.6, 1.6);
  }

  // Scenery, kept away from the road
  const clearance = g.roadW / 2 + 22;
  let placed = 0;
  for (let attempt = 0; attempt < 260 && placed < 70; attempt++) {
    const x = rng() * w;
    const y = rng() * h;
    const s = 11 + rng() * 14;
    const kind = theme.decor[Math.floor(rng() * theme.decor.length)];
    if (distanceToRoad(g, x, y) < clearance + s * 1.5) continue;
    drawDecor(c, kind, x, y, s, rng);
    placed++;
  }

  // Road: curbs, asphalt, lane dividers
  c.lineJoin = 'round';
  c.lineCap = 'butt';
  strokePath(c, g.pts);
  c.strokeStyle = theme.curbA;
  c.lineWidth = g.roadW + 14;
  c.stroke();
  c.setLineDash([13, 13]);
  c.strokeStyle = theme.curbB;
  c.stroke();
  c.setLineDash([]);
  strokePath(c, g.pts);
  c.strokeStyle = theme.asphalt;
  c.lineWidth = g.roadW + 2;
  c.stroke();

  c.strokeStyle = 'rgba(244,246,255,0.5)';
  c.lineWidth = 2;
  c.setLineDash([16, 14]);
  for (let k = 1; k < g.lanes; k++) {
    strokePath(c, offsetPath(g, (k - g.lanes / 2) * g.laneW));
    c.stroke();
  }
  c.setLineDash([]);

  // Start line and chequered finish line
  const len = carLength(g);
  const band = (distance: number, checker: boolean) => {
    const p = pointAtDistance(g, distance);
    const a = pointAtDistance(g, distance - 6);
    const b = pointAtDistance(g, distance + 6);
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    c.save();
    c.translate(p.x, p.y);
    c.rotate(ang);
    if (checker) {
      const cell = 6;
      const n = Math.ceil(g.roadW / cell);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < 2; j++) {
          c.fillStyle = (i + j) % 2 === 0 ? '#f4f6ff' : '#10131f';
          c.fillRect(-cell + j * cell, -g.roadW / 2 + i * cell, cell, Math.min(cell, g.roadW / 2 - (-g.roadW / 2 + i * cell)));
        }
      }
    } else {
      c.fillStyle = 'rgba(255,255,255,0.8)';
      c.fillRect(-2, -g.roadW / 2, 4, g.roadW);
    }
    c.restore();
  };
  band(len * 1.35, false);
  band(g.length - len * 0.15, true);
}

interface Scene {
  key: string;
  g: Geometry;
  canvas: HTMLCanvasElement | null;
  spec: TrackSpec;
}

let sceneCache: Scene | null = null;

function getScene(spec: TrackSpec, w: number, h: number, lanes: number, dpr: number): Scene {
  const key = `${spec.theme}|${spec.seed}|${spec.turns}|${w}x${h}|${lanes}|${dpr}`;
  if (sceneCache && sceneCache.key === key) return sceneCache;
  const g = buildGeometry(spec, w, h, lanes);
  let canvas: HTMLCanvasElement | null = null;
  try {
    canvas = document.createElement('canvas');
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const c = canvas.getContext('2d');
    if (c) {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderScene(c, g, spec, w, h);
    } else {
      canvas = null;
    }
  } catch {
    canvas = null;
  }
  sceneCache = { key, g, canvas, spec };
  return sceneCache;
}

function drawWeather(c: CanvasRenderingContext2D, weather: Weather, w: number, h: number, t: number) {
  if (weather === 'none') return;
  c.save();
  if (weather === 'snow') {
    c.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 70; i++) {
      const x = (hash(i + 1) * w + Math.sin(t * 0.8 + i) * 14 + w) % w;
      const y = (hash(i + 90) * h + t * (22 + hash(i + 5) * 34)) % h;
      c.beginPath();
      c.arc(x, y, 1.4 + hash(i + 33) * 1.6, 0, Math.PI * 2);
      c.fill();
    }
  } else if (weather === 'rain') {
    c.strokeStyle = 'rgba(190,210,255,0.5)';
    c.lineWidth = 1.2;
    c.beginPath();
    for (let i = 0; i < 90; i++) {
      const x = hash(i + 2) * w;
      const y = (hash(i + 70) * h + t * 520) % h;
      c.moveTo(x, y);
      c.lineTo(x - 4, y + 12);
    }
    c.stroke();
  } else if (weather === 'embers') {
    for (let i = 0; i < 45; i++) {
      const x = (hash(i + 4) * w + Math.sin(t + i) * 10 + w) % w;
      const y = h - ((hash(i + 60) * h + t * (18 + hash(i + 8) * 30)) % h);
      c.fillStyle = `rgba(255,${120 + Math.floor(hash(i) * 100)},40,0.85)`;
      c.fillRect(x, y, 2.2, 2.2);
    }
  }
  c.restore();
}

// ---------------------------------------------------------------- top-down cars

function drawCarTop(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  len: number,
  def: CarDef,
  flame: number,
  time: number,
) {
  const wd = len * 0.5;
  c.save();
  c.translate(x, y);
  c.rotate(angle);

  // headlight beam
  const beam = c.createLinearGradient(len / 2, 0, len * 1.5, 0);
  beam.addColorStop(0, 'rgba(255,247,194,0.26)');
  beam.addColorStop(1, 'rgba(255,247,194,0)');
  c.fillStyle = beam;
  c.beginPath();
  c.moveTo(len / 2, -wd * 0.3);
  c.lineTo(len * 1.5, -wd * 0.9);
  c.lineTo(len * 1.5, wd * 0.9);
  c.lineTo(len / 2, wd * 0.3);
  c.closePath();
  c.fill();

  // nitro flame
  if (flame > 0.05) {
    const flen = len * (0.35 + flame * 0.55) * (0.85 + 0.15 * Math.sin(time * 40));
    const g = c.createLinearGradient(-len / 2, 0, -len / 2 - flen, 0);
    g.addColorStop(0, 'rgba(255,240,150,0.95)');
    g.addColorStop(0.5, 'rgba(255,140,40,0.8)');
    g.addColorStop(1, 'rgba(255,60,120,0)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(-len / 2 + 2, -wd * 0.22);
    c.lineTo(-len / 2 - flen, 0);
    c.lineTo(-len / 2 + 2, wd * 0.22);
    c.closePath();
    c.fill();
  }

  // shadow + wheels
  c.fillStyle = 'rgba(0,0,0,0.35)';
  rr(c, -len / 2 + 2, -wd / 2 + 3, len, wd, wd * 0.3);
  c.fill();
  c.fillStyle = '#10131f';
  for (const wx of [-len * 0.27, len * 0.27]) {
    for (const side of [-1, 1]) {
      rr(c, wx - len * 0.1, side * (wd / 2) - wd * 0.09 + (side > 0 ? -wd * 0.02 : wd * 0.02), len * 0.2, wd * 0.2, wd * 0.07);
      c.fill();
    }
  }

  // body
  c.fillStyle = def.body;
  rr(c, -len / 2, -wd / 2, len, wd, wd * 0.36);
  c.fill();
  c.fillStyle = def.accent;
  c.fillRect(-len * 0.45, -wd * 0.07, len * 0.9, wd * 0.14);

  // cabin (shape changes the proportions)
  const cabinX = def.shape === 'coupe' ? -0.2 : def.shape === 'hatch' ? -0.08 : -0.14;
  const cabinL = def.shape === 'coupe' ? 0.36 : def.shape === 'hatch' ? 0.46 : 0.4;
  c.fillStyle = '#bfe3ff';
  rr(c, len * cabinX, -wd * 0.36, len * cabinL, wd * 0.72, wd * 0.16);
  c.fill();
  c.fillStyle = def.body;
  rr(c, len * (cabinX + 0.07), -wd * 0.3, len * (cabinL - 0.14), wd * 0.6, wd * 0.12);
  c.fill();

  // lights
  c.fillStyle = '#fff7c2';
  c.fillRect(len / 2 - len * 0.09, -wd * 0.38, len * 0.07, wd * 0.2);
  c.fillRect(len / 2 - len * 0.09, wd * 0.18, len * 0.07, wd * 0.2);
  c.fillStyle = '#ff5a5a';
  c.fillRect(-len / 2 + len * 0.02, -wd * 0.38, len * 0.06, wd * 0.2);
  c.fillRect(-len / 2 + len * 0.02, wd * 0.18, len * 0.06, wd * 0.2);
  c.restore();
}

/** Draws one complete frame. Call every animation frame. */
export function drawRace(ctx: CanvasRenderingContext2D, w: number, h: number, state: RenderState) {
  const lanes = Math.max(2, state.cars.length);
  const spec = state.track ?? DEFAULT_TRACK;
  const dpr = typeof ctx.getTransform === 'function' ? ctx.getTransform().a || 1 : 1;
  const scene = getScene(spec, w, h, lanes, dpr);
  const g = scene.g;
  const theme = THEMES[spec.theme % THEMES.length];

  ctx.clearRect(0, 0, w, h);
  if (scene.canvas) ctx.drawImage(scene.canvas, 0, 0, w, h);
  else renderScene(ctx, g, spec, w, h);
  if (!state.reduceMotion) drawWeather(ctx, theme.weather, w, h, state.time);

  const len = carLength(g);
  const fontPx = clamp(len * 0.34, 10, 13);
  const tags: { text: string; x: number; y: number; you: boolean }[] = [];

  state.cars.forEach((car, index) => {
    const def = CAR_BY_ID.get(car.car) ?? CARS[0];
    const pose = carPose(g, distanceForProgress(g, car.progress), index);

    ctx.save();
    if (car.offline) ctx.globalAlpha = 0.45;
    if (!state.reduceMotion && car.speed > 0.25) {
      ctx.save();
      ctx.translate(pose.x, pose.y);
      ctx.rotate(pose.angle);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const ll = len * (0.4 + 0.7 * car.speed) * (0.6 + hash(i + index * 5) * 0.6);
        const yy = (hash(i * 3 + index) - 0.5) * len * 0.5;
        const phase = (state.time * (3 + car.speed * 4) + hash(i + 40)) % 1;
        const sx = -len * 0.55 - phase * ll;
        ctx.beginPath();
        ctx.moveTo(sx, yy);
        ctx.lineTo(sx - ll, yy);
        ctx.stroke();
      }
      ctx.restore();
    }
    drawCarTop(ctx, pose.x, pose.y, pose.angle, len, def, state.reduceMotion ? 0 : Math.max(0, (car.speed - 0.6) / 0.4), state.time);
    ctx.restore();

    const label = car.finished && car.position ? `${car.position}. ${car.name}` : car.dnf ? `${car.name} (out)` : car.name;
    tags.push({ text: `${label}${car.isYou ? ' (you)' : ''}`, x: pose.x, y: pose.y - len * 0.62, you: car.isYou });
  });

  // name tags last so they are never hidden by a car; yours on top
  for (const tag of tags.filter((t) => !t.you).concat(tags.filter((t) => t.you))) {
    drawTag(ctx, tag.text, tag.x, tag.y, tag.you, fontPx);
  }
}

function drawTag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, you: boolean, fontPx: number) {
  ctx.font = `700 ${fontPx}px system-ui, "Segoe UI", sans-serif`;
  const padX = 6;
  const tw = ctx.measureText(text).width + padX * 2;
  const th = fontPx + 6;
  const cx = clamp(x, tw / 2 + 2, 1e6);
  const ty = Math.max(y, th + 3); // never cut off by the top edge of the canvas
  ctx.fillStyle = you ? '#ffc233' : 'rgba(10,16,34,0.82)';
  rr(ctx, cx - tw / 2, ty - th, tw, th, 6);
  ctx.fill();
  ctx.fillStyle = you ? '#10131f' : '#eef2ff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, ty - th / 2 + 0.5);
}
