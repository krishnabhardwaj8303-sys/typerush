import { CARS, type CarDef, type CarId } from '@typerush/shared';
import { drawTag, drawTrail, drawWeather, hash, paintSkin, rr, type RenderState, type Weather } from './raceRenderer';
import type { SkinId } from '../lib/shop';

// "Highway" race view: a straight multi-lane road seen from slightly above. The camera follows your car, so the
// other cars slide ahead of and behind you according to the real gap in progress. Scenery scrolls at different
// speeds (parallax) and there is a speedometer in the corner. Everything is drawn from code (no image files).

type Skyline = 'city' | 'mesa' | 'pines' | 'sea' | 'mountain' | 'volcano' | 'harbor' | 'moon';

interface Look {
  skyTop: string;
  skyBottom: string;
  far: string;
  near: string;
  ground: string;
  asphaltTop: string;
  asphaltBottom: string;
  rail: string;
  lamp: string;
  kind: Skyline;
  stars: boolean;
  orb: 'sun' | 'moon' | 'none';
  orbColor: string;
  weather: Weather;
  windows: boolean;
}

// One look per track theme (same order as TRACK_THEME_NAMES).
const LOOKS: Look[] = [
  { skyTop: '#2b1055', skyBottom: '#ff7e5f', far: '#4a2370', near: '#26123f', ground: '#1c1236', asphaltTop: '#3a3f58', asphaltBottom: '#242842', rail: '#c9b8ff', lamp: '#ffd27a', kind: 'city', stars: false, orb: 'sun', orbColor: '#ffd9a0', weather: 'none', windows: true },
  { skyTop: '#f2a65a', skyBottom: '#ffe9b8', far: '#d68a55', near: '#b5653a', ground: '#c28a52', asphaltTop: '#5b5347', asphaltBottom: '#3d372f', rail: '#f6e7c8', lamp: '#fff2c4', kind: 'mesa', stars: false, orb: 'sun', orbColor: '#fff5d6', weather: 'none', windows: false },
  { skyTop: '#123d33', skyBottom: '#9bd9b0', far: '#1f6b4c', near: '#0f4a33', ground: '#11402c', asphaltTop: '#4a4f4c', asphaltBottom: '#2f3331', rail: '#e8efe8', lamp: '#fff2c4', kind: 'pines', stars: false, orb: 'sun', orbColor: '#f4ffd8', weather: 'none', windows: false },
  { skyTop: '#3fa7ff', skyBottom: '#dff3ff', far: '#2f86d6', near: '#1f6fb8', ground: '#e8d6a0', asphaltTop: '#50607a', asphaltBottom: '#37445a', rail: '#ffffff', lamp: '#ffffff', kind: 'sea', stars: false, orb: 'sun', orbColor: '#fff8d0', weather: 'none', windows: false },
  { skyTop: '#8aa6c6', skyBottom: '#eef6ff', far: '#b9cde3', near: '#8fa9c4', ground: '#dbe9f5', asphaltTop: '#5b6678', asphaltBottom: '#3f4858', rail: '#2f7bff', lamp: '#ffffff', kind: 'pines', stars: false, orb: 'none', orbColor: '#ffffff', weather: 'snow', windows: false },
  { skyTop: '#05030f', skyBottom: '#3a0f66', far: '#1d1550', near: '#0e0a2c', ground: '#0a0820', asphaltTop: '#1b2040', asphaltBottom: '#0d1128', rail: '#22d3ee', lamp: '#ff3ea5', kind: 'city', stars: true, orb: 'moon', orbColor: '#ffe6ff', weather: 'none', windows: true },
  { skyTop: '#39475f', skyBottom: '#c9d4e6', far: '#7d8ba3', near: '#566379', ground: '#4d5a4a', asphaltTop: '#4b5058', asphaltBottom: '#30343b', rail: '#ffc233', lamp: '#fff2c4', kind: 'mountain', stars: false, orb: 'sun', orbColor: '#fffbe6', weather: 'none', windows: false },
  { skyTop: '#1a0705', skyBottom: '#ff5a1f', far: '#4a1a10', near: '#2b0d08', ground: '#2a0f0a', asphaltTop: '#3a3232', asphaltBottom: '#221c1c', rail: '#ff7a1a', lamp: '#ffb347', kind: 'volcano', stars: false, orb: 'none', orbColor: '#ff9a4a', weather: 'embers', windows: false },
  { skyTop: '#18222f', skyBottom: '#4d6178', far: '#2e3d52', near: '#1f2b3b', ground: '#1b2533', asphaltTop: '#38404f', asphaltBottom: '#242a36', rail: '#ffc233', lamp: '#ffe9a8', kind: 'harbor', stars: false, orb: 'none', orbColor: '#cfd8e6', weather: 'rain', windows: true },
  { skyTop: '#05060d', skyBottom: '#1b1f3d', far: '#2a2d4a', near: '#171a33', ground: '#12121f', asphaltTop: '#575b6b', asphaltBottom: '#3a3d4b', rail: '#34d399', lamp: '#b7ffe8', kind: 'moon', stars: true, orb: 'moon', orbColor: '#7fb4ff', weather: 'none', windows: false },
];

const CAR_BY_ID = new Map<CarId, CarDef>(CARS.map((c) => [c.id, c]));
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** One repeating band of scenery (buildings, pines, mesas...) drawn from stable shapes so it never flickers. */
function drawBand(
  c: CanvasRenderingContext2D,
  look: Look,
  color: string,
  baseY: number,
  maxH: number,
  unit: number,
  offset: number,
  salt: number,
  w: number,
  windows: boolean,
) {
  const first = Math.floor(offset / unit);
  const count = Math.ceil(w / unit) + 2;
  c.fillStyle = color;
  for (let i = first; i < first + count; i++) {
    const x = i * unit - offset;
    const r1 = hash(i * 7 + salt);
    const r2 = hash(i * 13 + salt + 5);
    const hh = maxH * (0.35 + 0.65 * r1);
    switch (look.kind) {
      case 'city':
      case 'harbor': {
        const bw = unit * (0.62 + 0.3 * r2);
        c.fillRect(x, baseY - hh, bw, hh + 2);
        if (windows) {
          c.fillStyle = look.kind === 'city' ? 'rgba(255,226,140,0.55)' : 'rgba(255,233,168,0.4)';
          for (let wy = baseY - hh + 6; wy < baseY - 6; wy += 9) {
            for (let wx = x + 5; wx < x + bw - 6; wx += 8) {
              if (hash(i * 31 + wy * 0.7 + wx * 0.3) > 0.55) c.fillRect(wx, wy, 3, 4);
            }
          }
          c.fillStyle = color;
        }
        break;
      }
      case 'mesa': {
        const bw = unit * (0.7 + 0.25 * r2);
        c.beginPath();
        c.moveTo(x, baseY + 2);
        c.lineTo(x + bw * 0.12, baseY - hh);
        c.lineTo(x + bw * 0.88, baseY - hh);
        c.lineTo(x + bw, baseY + 2);
        c.closePath();
        c.fill();
        break;
      }
      case 'pines': {
        const bw = unit * 0.7;
        for (let k = 0; k < 3; k++) {
          const ty = baseY - hh * (0.45 + k * 0.28);
          c.beginPath();
          c.moveTo(x + bw / 2, ty - hh * 0.32);
          c.lineTo(x + bw * 0.92, ty + hh * 0.12);
          c.lineTo(x + bw * 0.08, ty + hh * 0.12);
          c.closePath();
          c.fill();
        }
        c.fillRect(x + bw / 2 - 2, baseY - hh * 0.2, 4, hh * 0.2 + 2);
        break;
      }
      case 'mountain':
      case 'volcano': {
        const bw = unit * (1.1 + 0.5 * r2);
        c.beginPath();
        c.moveTo(x, baseY + 2);
        if (look.kind === 'volcano' && r2 > 0.55) {
          c.lineTo(x + bw * 0.38, baseY - hh);
          c.lineTo(x + bw * 0.62, baseY - hh);
        } else {
          c.lineTo(x + bw * 0.5, baseY - hh);
        }
        c.lineTo(x + bw, baseY + 2);
        c.closePath();
        c.fill();
        break;
      }
      case 'sea': {
        c.fillRect(x, baseY - hh * 0.18, unit + 1, hh * 0.18 + 2);
        break;
      }
      case 'moon': {
        c.beginPath();
        c.ellipse(x + unit / 2, baseY + 2, unit * (0.5 + 0.3 * r2), hh * 0.55, 0, Math.PI, 0);
        c.fill();
        break;
      }
    }
  }
}

function drawStars(c: CanvasRenderingContext2D, w: number, horizon: number, t: number, reduce: boolean) {
  for (let i = 0; i < 46; i++) {
    const x = hash(i * 3.1) * w;
    const y = hash(i * 5.7 + 2) * horizon * 0.85;
    const tw = reduce ? 0.7 : 0.5 + 0.5 * Math.sin(t * 2 + i);
    c.fillStyle = `rgba(255,255,255,${0.25 + 0.55 * tw})`;
    c.fillRect(x, y, 1.6, 1.6);
  }
}

function drawGauge(c: CanvasRenderingContext2D, w: number, h: number, wpm: number) {
  const r = clamp(Math.min(h * 0.2, w * 0.15), 34, 66);
  const cx = r + 12;
  const cy = h - 8;
  c.save();
  c.fillStyle = 'rgba(8,12,28,0.78)';
  c.beginPath();
  c.arc(cx, cy, r + 6, Math.PI, 0);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.18)';
  c.lineWidth = 1.5;
  c.stroke();
  const max = 150;
  const frac = clamp(wpm / max, 0, 1);
  // ticks
  for (let i = 0; i <= 15; i++) {
    const a = Math.PI + (i / 15) * Math.PI;
    const major = i % 5 === 0;
    const r0 = r - (major ? 11 : 7);
    const hot = i / 15 > 0.75;
    c.strokeStyle = hot ? '#ff5a5a' : i / 15 > 0.5 ? '#ffc233' : '#34d399';
    c.lineWidth = major ? 2.4 : 1.4;
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    c.lineTo(cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2));
    c.stroke();
  }
  // needle
  const na = Math.PI + frac * Math.PI;
  c.strokeStyle = '#ffffff';
  c.lineWidth = 2.6;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(cx, cy);
  c.lineTo(cx + Math.cos(na) * (r - 14), cy + Math.sin(na) * (r - 14));
  c.stroke();
  c.fillStyle = '#ffc233';
  c.beginPath();
  c.arc(cx, cy, 4.5, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#eef2ff';
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  c.font = `800 ${Math.round(r * 0.34)}px system-ui, "Segoe UI", sans-serif`;
  c.fillText(String(Math.round(wpm)), cx, cy - r * 0.28);
  c.fillStyle = '#9fb0e6';
  c.font = `700 ${Math.max(8, Math.round(r * 0.17))}px system-ui, "Segoe UI", sans-serif`;
  c.fillText('WPM', cx, cy - r * 0.1);
  c.restore();
}


// ------------------------------------------------------------------ 3D-looking car (side view, lit from above)

function shade(hex: string, amount: number): string {
  // amount > 0 mixes towards white, < 0 towards black
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount)),
  );
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
}

type Pt2 = [number, number];
const CABINS: Record<string, Pt2[]> = {
  sedan: [[-0.29, -0.228], [-0.19, -0.338], [0.12, -0.338], [0.27, -0.228]],
  coupe: [[-0.25, -0.228], [-0.1, -0.328], [0.1, -0.328], [0.3, -0.228]],
  hatch: [[-0.32, -0.228], [-0.3, -0.342], [0.1, -0.342], [0.26, -0.228]],
};

interface Car3D {
  speed: number;
  time: number;
  skin?: SkinId;
  wheelSpin: number;
}

/** Draws a car facing right. (x, groundY) is the middle of the car where the tyres touch the road; L is its length. */
function drawCar3D(c: CanvasRenderingContext2D, x: number, groundY: number, L: number, def: CarDef, o: Car3D) {
  const u = L;
  c.save();
  c.translate(x, groundY);

  // headlight beam along the road
  const beam = c.createLinearGradient(0.46 * u, 0, 1.3 * u, 0);
  beam.addColorStop(0, 'rgba(255,247,194,0.30)');
  beam.addColorStop(1, 'rgba(255,247,194,0)');
  c.fillStyle = beam;
  c.beginPath();
  c.moveTo(0.46 * u, -0.15 * u);
  c.lineTo(1.3 * u, -0.28 * u);
  c.lineTo(1.3 * u, 0.04 * u);
  c.lineTo(0.46 * u, -0.1 * u);
  c.closePath();
  c.fill();

  // nitro flame out of the exhaust
  if (o.speed > 0.6) {
    const flame = (o.speed - 0.6) / 0.4;
    const fl = u * (0.18 + flame * 0.34) * (0.85 + 0.15 * Math.sin(o.time * 45));
    const g = c.createLinearGradient(-0.5 * u, 0, -0.5 * u - fl, 0);
    g.addColorStop(0, 'rgba(255,240,150,0.95)');
    g.addColorStop(0.5, 'rgba(255,140,40,0.75)');
    g.addColorStop(1, 'rgba(255,60,120,0)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(-0.5 * u, -0.105 * u);
    c.lineTo(-0.5 * u - fl, -0.088 * u);
    c.lineTo(-0.5 * u, -0.07 * u);
    c.closePath();
    c.fill();
  }

  // body silhouette
  const body = new Path2D();
  body.moveTo(-0.5 * u, -0.07 * u);
  body.lineTo(-0.5 * u, -0.17 * u);
  body.quadraticCurveTo(-0.5 * u, -0.215 * u, -0.45 * u, -0.222 * u);
  body.lineTo(-0.3 * u, -0.228 * u);
  body.lineTo(0.2 * u, -0.234 * u);
  body.quadraticCurveTo(0.36 * u, -0.226 * u, 0.46 * u, -0.17 * u);
  body.quadraticCurveTo(0.5 * u, -0.15 * u, 0.5 * u, -0.1 * u);
  body.lineTo(0.5 * u, -0.07 * u);
  body.quadraticCurveTo(0.5 * u, -0.048 * u, 0.46 * u, -0.048 * u);
  body.lineTo(-0.46 * u, -0.048 * u);
  body.quadraticCurveTo(-0.5 * u, -0.048 * u, -0.5 * u, -0.07 * u);
  body.closePath();

  // cabin (roof + glass) sits behind the body outline so the door line stays clean
  const cab = CABINS[def.shape] ?? CABINS.sedan;
  const roof = new Path2D();
  roof.moveTo(cab[0][0] * u, cab[0][1] * u);
  for (let i = 1; i < cab.length; i++) roof.lineTo(cab[i][0] * u, cab[i][1] * u);
  roof.closePath();
  c.fillStyle = shade(def.body, -0.25);
  c.fill(roof);

  // glass: the roof polygon pulled in towards its centre
  const cx0 = cab.reduce((a, p) => a + p[0], 0) / cab.length;
  const cy0 = cab.reduce((a, p) => a + p[1], 0) / cab.length;
  const glass = new Path2D();
  cab.forEach((p, i) => {
    const gx = (cx0 + (p[0] - cx0) * 0.84) * u;
    const gy = (cy0 + (p[1] - cy0) * 0.8 + (i === 0 || i === 3 ? -0.002 : 0.004)) * u;
    if (i === 0) glass.moveTo(gx, gy);
    else glass.lineTo(gx, gy);
  });
  glass.closePath();
  const gg = c.createLinearGradient(0, -0.34 * u, 0, -0.23 * u);
  gg.addColorStop(0, '#d7efff');
  gg.addColorStop(0.55, '#6aa9e6');
  gg.addColorStop(1, '#1f3d6b');
  c.fillStyle = gg;
  c.fill(glass);
  c.save();
  c.clip(glass);
  c.fillStyle = 'rgba(255,255,255,0.38)';
  c.beginPath();
  c.moveTo(-0.2 * u, -0.34 * u);
  c.lineTo(-0.1 * u, -0.34 * u);
  c.lineTo(-0.2 * u, -0.226 * u);
  c.lineTo(-0.3 * u, -0.226 * u);
  c.closePath();
  c.fill();
  c.fillRect(0.0 * u, -0.34 * u, 0.025 * u, 0.12 * u); // pillar
  c.fillStyle = shade(def.body, -0.25);
  c.fillRect(-0.03 * u, -0.34 * u, 0.03 * u, 0.12 * u);
  c.restore();

  // body paint with top light and a dark underside
  const bg = c.createLinearGradient(0, -0.234 * u, 0, -0.048 * u);
  bg.addColorStop(0, shade(def.body, 0.38));
  bg.addColorStop(0.25, shade(def.body, 0.05));
  bg.addColorStop(0.75, shade(def.body, -0.25));
  bg.addColorStop(1, shade(def.body, -0.55));
  c.fillStyle = bg;
  c.fill(body);

  c.save();
  c.clip(body);
  paintSkin(c, o.skin, -0.5 * u, -0.234 * u, u, 0.186 * u, 0.04 * u);
  // accent stripe, door shut-lines, handles
  c.fillStyle = def.accent;
  c.fillRect(-0.5 * u, -0.142 * u, u, 0.02 * u);
  c.fillStyle = 'rgba(0,0,0,0.28)';
  c.fillRect(-0.1 * u, -0.226 * u, 0.006 * u, 0.17 * u);
  c.fillRect(0.14 * u, -0.226 * u, 0.006 * u, 0.17 * u);
  c.fillStyle = 'rgba(255,255,255,0.55)';
  c.fillRect(-0.075 * u, -0.2 * u, 0.04 * u, 0.008 * u);
  c.fillRect(0.17 * u, -0.2 * u, 0.04 * u, 0.008 * u);
  // roof-line highlight and bottom shade
  c.fillStyle = 'rgba(255,255,255,0.45)';
  c.fillRect(-0.4 * u, -0.226 * u, 0.7 * u, 0.006 * u);
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.fillRect(-0.5 * u, -0.07 * u, u, 0.025 * u);
  // wheel arches
  c.fillStyle = '#080a12';
  for (const wx of [-0.3, 0.3]) {
    c.beginPath();
    c.arc(wx * u, -0.088 * u, 0.112 * u, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();

  // side mirror, spoiler (coupe), lights, exhaust pipe
  c.fillStyle = shade(def.body, -0.3);
  rr(c, 0.2 * u, -0.25 * u, 0.04 * u, 0.025 * u, 0.01 * u);
  c.fill();
  if (def.shape === 'coupe') {
    c.fillStyle = shade(def.body, -0.4);
    c.fillRect(-0.48 * u, -0.262 * u, 0.012 * u, 0.04 * u);
    rr(c, -0.52 * u, -0.27 * u, 0.15 * u, 0.018 * u, 0.008 * u);
    c.fill();
  }
  c.fillStyle = '#fff7c2';
  rr(c, 0.455 * u, -0.168 * u, 0.045 * u, 0.034 * u, 0.012 * u);
  c.fill();
  c.fillStyle = '#ff4d4d';
  rr(c, -0.502 * u, -0.178 * u, 0.026 * u, 0.04 * u, 0.008 * u);
  c.fill();
  c.fillStyle = '#2a2d38';
  rr(c, -0.528 * u, -0.103 * u, 0.045 * u, 0.026 * u, 0.012 * u);
  c.fill();

  // wheels
  const rw = 0.088 * u;
  for (const wx of [-0.3, 0.3]) {
    const wcx = wx * u;
    const wcy = -rw;
    c.fillStyle = '#0c0e17';
    c.beginPath();
    c.arc(wcx, wcy, rw, 0, Math.PI * 2);
    c.fill();
    const rim = c.createRadialGradient(wcx - rw * 0.2, wcy - rw * 0.2, 1, wcx, wcy, rw * 0.64);
    rim.addColorStop(0, '#f4f6ff');
    rim.addColorStop(1, '#8b93a8');
    c.fillStyle = rim;
    c.beginPath();
    c.arc(wcx, wcy, rw * 0.64, 0, Math.PI * 2);
    c.fill();
    if (o.speed < 0.55) {
      c.strokeStyle = '#3a4054';
      c.lineWidth = Math.max(1, rw * 0.11);
      for (let k = 0; k < 5; k++) {
        const a = o.wheelSpin + (k * Math.PI * 2) / 5;
        c.beginPath();
        c.moveTo(wcx, wcy);
        c.lineTo(wcx + Math.cos(a) * rw * 0.6, wcy + Math.sin(a) * rw * 0.6);
        c.stroke();
      }
    } else {
      // too fast to see spokes: a soft blurred disc
      c.fillStyle = 'rgba(40,46,66,0.35)';
      c.beginPath();
      c.arc(wcx, wcy, rw * 0.62, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#2a2d38';
    c.beginPath();
    c.arc(wcx, wcy, rw * 0.14, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

// ------------------------------------------------------------------ exhaust smoke

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  grow: number;
}
const smoke = new Map<string, Puff[]>();
const smokeCarry = new Map<string, number>();
const lastSpeed = new Map<string, number>();
let lastTime = -1;
let lastScroll = 0;
const MAX_PUFFS = 70;

function stepSmoke(t: number, scroll: number): number {
  const dt = lastTime < 0 || t < lastTime ? 0 : Math.min(0.05, t - lastTime);
  const reset = lastTime >= 0 && t < lastTime; // a new race started
  const dScroll = reset || scroll < lastScroll ? 0 : Math.min(60, scroll - lastScroll);
  if (reset) {
    smoke.clear();
    smokeCarry.clear();
    lastSpeed.clear();
  }
  lastTime = t;
  lastScroll = scroll;
  for (const list of smoke.values()) {
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.age += dt;
      if (p.age >= p.life) {
        list.splice(i, 1);
        continue;
      }
      // the world scrolls past, so smoke left behind slides backwards on screen
      p.x += p.vx * dt - dScroll;
      p.y += p.vy * dt;
      p.size += p.grow * dt;
    }
  }
  return dt;
}

function emitSmoke(id: string, ex: number, ey: number, L: number, speed: number, dt: number) {
  let list = smoke.get(id);
  if (!list) {
    list = [];
    smoke.set(id, list);
  }
  const prev = lastSpeed.get(id) ?? speed;
  lastSpeed.set(id, speed);
  if (dt <= 0) return;
  const accel = Math.max(0, (speed - prev) / dt);
  const rate = speed > 0.04 ? 10 + 42 * speed + Math.min(60, accel * 30) : 3;
  let carry = (smokeCarry.get(id) ?? 0) + rate * dt;
  while (carry >= 1 && list.length < MAX_PUFFS) {
    carry -= 1;
    list.push({
      x: ex + (Math.random() - 0.5) * 3,
      y: ey + (Math.random() - 0.5) * 3,
      vx: -(8 + Math.random() * 26) * (0.6 + speed),
      vy: -(7 + Math.random() * 16),
      age: 0,
      life: 0.7 + Math.random() * 0.8 + speed * 0.4,
      size: L * (0.035 + Math.random() * 0.02),
      grow: L * (0.16 + speed * 0.3 + Math.random() * 0.1),
    });
  }
  smokeCarry.set(id, Math.min(carry, 3));
}

function drawSmoke(c: CanvasRenderingContext2D, id: string, dark: boolean) {
  const list = smoke.get(id);
  if (!list) return;
  for (const p of list) {
    const k = p.age / p.life;
    const a = 0.75 * (1 - k) * (1 - k);
    const base = dark ? '190,196,215' : '236,238,244';
    const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
    g.addColorStop(0, `rgba(${base},${a})`);
    g.addColorStop(1, `rgba(${base},0)`);
    c.fillStyle = g;
    c.beginPath();
    c.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    c.fill();
  }
}

export function drawHighway(ctx: CanvasRenderingContext2D, w: number, h: number, state: RenderState) {
  const look = LOOKS[(state.track?.theme ?? 0) % LOOKS.length];
  const t = state.time;
  const sc = state.scroll;
  const reduce = state.reduceMotion;
  const n = Math.max(2, Math.min(5, state.cars.length));

  const horizon = h * 0.3;
  const barrierTop = h * 0.33;
  const roadTop = h * 0.4;
  const roadBottom = h * 0.9;
  const laneH = (roadBottom - roadTop) / n;

  ctx.clearRect(0, 0, w, h);
  const smokeDt = stepSmoke(t, sc);

  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, horizon + 4);
  sky.addColorStop(0, look.skyTop);
  sky.addColorStop(1, look.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon + 4);
  if (look.stars) drawStars(ctx, w, horizon, t, reduce);
  if (look.orb !== 'none') {
    const ox = w * 0.74 - ((sc * 0.01) % (w * 0.5));
    const oy = horizon * (look.orb === 'sun' ? 0.62 : 0.4);
    const rad = Math.max(14, h * 0.07);
    const glow = ctx.createRadialGradient(ox, oy, rad * 0.4, ox, oy, rad * 3);
    glow.addColorStop(0, look.orbColor + 'aa');
    glow.addColorStop(1, look.orbColor + '00');
    ctx.fillStyle = glow;
    ctx.fillRect(ox - rad * 3, oy - rad * 3, rad * 6, rad * 6);
    ctx.fillStyle = look.orbColor;
    ctx.beginPath();
    ctx.arc(ox, oy, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  // scenery layers (far moves slowly, near faster)
  drawBand(ctx, look, look.far, horizon + 2, horizon * 0.62, Math.max(36, w * 0.07), sc * 0.05, 1, w, false);
  drawBand(ctx, look, look.near, horizon + 6, horizon * 0.5, Math.max(30, w * 0.055), sc * 0.12, 9, w, look.windows);

  // roadside ground + guard rail
  ctx.fillStyle = look.ground;
  ctx.fillRect(0, horizon, w, h - horizon);
  const rail = ctx.createLinearGradient(0, barrierTop, 0, roadTop);
  rail.addColorStop(0, 'rgba(255,255,255,0.14)');
  rail.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = rail;
  ctx.fillRect(0, barrierTop, w, roadTop - barrierTop);
  ctx.fillStyle = look.rail;
  ctx.fillRect(0, barrierTop + 2, w, 3);
  const post = 46;
  const postOff = (sc * 0.6) % post;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  for (let x = -postOff; x < w; x += post) ctx.fillRect(x, barrierTop + 5, 3, roadTop - barrierTop - 5);

  // street lamps
  const lampGap = 340;
  const lampOff = (sc * 0.85) % lampGap;
  for (let x = -lampOff + 60; x < w + 40; x += lampGap) {
    ctx.fillStyle = 'rgba(10,12,24,0.8)';
    ctx.fillRect(x, barrierTop - h * 0.12, 3, h * 0.12 + 4);
    ctx.fillRect(x - 12, barrierTop - h * 0.12, 15, 3);
    const lg = ctx.createRadialGradient(x - 12, barrierTop - h * 0.115, 1, x - 12, barrierTop - h * 0.115, h * 0.16);
    lg.addColorStop(0, look.lamp + 'cc');
    lg.addColorStop(1, look.lamp + '00');
    ctx.fillStyle = lg;
    ctx.fillRect(x - 12 - h * 0.16, barrierTop - h * 0.275, h * 0.32, h * 0.32);
  }

  // asphalt
  const asp = ctx.createLinearGradient(0, roadTop, 0, roadBottom);
  asp.addColorStop(0, look.asphaltTop);
  asp.addColorStop(1, look.asphaltBottom);
  ctx.fillStyle = asp;
  ctx.fillRect(0, roadTop, w, roadBottom - roadTop);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 26; i++) {
    const x = (hash(i * 2.3) * (w + 200) - (sc * 1.0) % (w + 200) + (w + 200)) % (w + 200) - 100;
    ctx.fillRect(x, roadTop + hash(i * 4.1 + 1) * (roadBottom - roadTop), 14 + hash(i) * 22, 2);
  }
  // edge lines
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(0, roadTop - 1, w, 2.5);
  ctx.fillRect(0, roadBottom - 1.5, w, 2.5);
  // lane dashes
  const dash = 30;
  const dashOff = (sc * 1.0) % (dash * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let k = 1; k < n; k++) {
    const y = roadTop + k * laneH - 1.2;
    for (let x = -dashOff; x < w; x += dash * 2) ctx.fillRect(x, y, dash, 2.4);
  }
  // shoulder below the road
  const sh = ctx.createLinearGradient(0, roadBottom, 0, h);
  sh.addColorStop(0, 'rgba(0,0,0,0.5)');
  sh.addColorStop(1, 'rgba(0,0,0,0.78)');
  ctx.fillStyle = sh;
  ctx.fillRect(0, roadBottom, w, h - roadBottom);

  // camera: you stay at a fixed spot, the others move by the real gap in progress
  const me = state.cars.find((c) => c.isYou);
  const myP = me ? me.progress : 0;
  const youX = w * 0.3;
  const span = w * 2.4;
  const len = clamp(laneH * 2.15, 30, 130);

  const startX = youX - myP * span;
  if (startX > -20 && startX < w + 20) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(startX, roadTop, 4, roadBottom - roadTop);
  }
  const finishX = youX + (1 - myP) * span;
  if (finishX > -60 && finishX < w + 60) {
    const cell = Math.max(5, laneH / 4);
    for (let y = roadTop, row = 0; y < roadBottom; y += cell, row++) {
      for (let col = 0; col < 3; col++) {
        ctx.fillStyle = (row + col) % 2 === 0 ? '#ffffff' : '#10131f';
        ctx.fillRect(finishX + col * cell, y, cell, Math.min(cell, roadBottom - y));
      }
    }
    // gantry
    ctx.fillStyle = 'rgba(10,12,24,0.9)';
    ctx.fillRect(finishX - 4, barrierTop - h * 0.1, 5, roadTop - barrierTop + h * 0.1);
    ctx.fillRect(finishX + 3 * cell - 1, barrierTop - h * 0.1, 5, roadTop - barrierTop + h * 0.1);
    const bw = 3 * cell + 14;
    ctx.fillStyle = '#ffc233';
    rr(ctx, finishX - 7, barrierTop - h * 0.13, bw, h * 0.05, 4);
    ctx.fill();
    ctx.fillStyle = '#10131f';
    ctx.font = `800 ${Math.max(9, Math.round(h * 0.034))}px system-ui, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FINISH', finishX - 7 + bw / 2, barrierTop - h * 0.105);
  }

  // speed streaks across the road while you go fast
  const mySpeed = me ? me.speed : 0;
  if (!reduce && mySpeed > 0.2) {
    ctx.strokeStyle = `rgba(255,255,255,${0.1 + 0.2 * mySpeed})`;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 10; i++) {
      const y = roadTop + 6 + hash(i * 9.7) * (roadBottom - roadTop - 12);
      const ll = 40 + 140 * mySpeed * (0.4 + hash(i + 3));
      const x = w - (((sc * (1.6 + hash(i) * 0.8)) + i * 211) % (w + 300)) + 100;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + ll, y);
      ctx.stroke();
    }
  }

  drawGauge(ctx, w, h, state.wpm ?? mySpeed * 120);

  // cars (far lanes first so nearer cars overlap them)
  const tags: { text: string; x: number; y: number; you: boolean; half: number; flip: boolean }[] = [];
  state.cars.forEach((car, index) => {
    const lane = Math.min(index, n - 1);
    const def = CAR_BY_ID.get(car.car) ?? CARS[0];
    const depth = n > 1 ? lane / (n - 1) : 1;
    const s = 0.88 + 0.12 * depth;
    const cy = roadTop + (lane + 0.5) * laneH;
    const rawX = car.isYou ? youX : youX + (car.progress - myP) * span;
    const cx = clamp(rawX, len * 0.7, w - len * 0.7);
    const cl = len * s;

    ctx.save();
    if (car.offline) ctx.globalAlpha = 0.45;
    if (car.trail && car.trail !== 'none' && car.speed > 0.1) {
      const pts = [];
      for (let k = 1; k <= 16; k++) pts.push({ x: cx - cl * 0.26 * k, y: cy });
      drawTrail(ctx, car.trail, pts, cl * 0.5, reduce ? 0 : t);
    }
    if (!reduce && car.speed > 0.25) {
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const ll = cl * (0.4 + 0.7 * car.speed) * (0.6 + hash(i + index * 5) * 0.6);
        const yy = cy + (hash(i * 3 + index) - 0.5) * cl * 0.4;
        const phase = (t * (3 + car.speed * 4) + hash(i + 40)) % 1;
        const sx = cx - cl * 0.55 - phase * ll;
        ctx.beginPath();
        ctx.moveTo(sx, yy);
        ctx.lineTo(sx - ll, yy);
        ctx.stroke();
      }
    }
    // ground shadow, exhaust smoke (behind the car), then the car itself
    const groundY = cy + cl * 0.2;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(cx, groundY + cl * 0.01, cl * 0.52, cl * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!reduce) {
      emitSmoke(car.id, cx - cl * 0.52, groundY - cl * 0.09, cl, car.speed, smokeDt);
      drawSmoke(ctx, car.id, look.stars || look.kind === 'volcano' || look.kind === 'harbor');
    }
    drawCar3D(ctx, cx, groundY, cl, def, { speed: car.speed, time: t, skin: car.skin, wheelSpin: sc * 0.05 + index });
    ctx.restore();

    const label = car.finished && car.position ? `${car.position}. ${car.name}` : car.dnf ? `${car.name} (out)` : car.name;
    const ahead = rawX > w - len * 0.7;
    const behind = rawX < len * 0.7;
    const text = `${behind && !car.isYou ? '<< ' : ''}${label}${car.isYou ? ' (you)' : ''}${ahead && !car.isYou ? ' >>' : ''}`;
    tags.push({ text, x: cx, y: cy, you: car.isYou, half: cl * 0.56, flip: ahead });
  });

  if (!reduce) drawWeather(ctx, look.weather, w, h, t);

  const fontPx = clamp(len * 0.17, 9, 12);
  ctx.font = `700 ${fontPx}px system-ui, "Segoe UI", sans-serif`;
  for (const tag of tags.filter((x) => !x.you).concat(tags.filter((x) => x.you))) {
    // The name tag sits beside the car (not on top of it), so small lanes stay readable.
    const tw = ctx.measureText(tag.text).width + 12;
    const bottom = tag.y + (fontPx + 6) / 2;
    const room = w - (tag.x + tag.half) - 4;
    const right = !tag.flip && room >= tw;
    drawTag(ctx, tag.text, right ? tag.x + tag.half + tw / 2 : tag.x - tag.half - tw / 2, bottom, tag.you, fontPx);
  }
}
