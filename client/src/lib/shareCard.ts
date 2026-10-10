// Draws a shareable result picture (a PNG) on a canvas and shares or downloads it.

import { CARS, DIFFICULTY_LABEL, type CarId, type Difficulty } from '@typerush/shared';
import { drawCar } from '../render/raceRenderer';
import type { SkinId } from './shop';

export interface ShareInfo {
  name: string;
  car: CarId;
  skin: SkinId;
  title: string;
  difficulty: Difficulty;
  wpm: number;
  accuracy: number;
  position: number;
  racers: number;
  points: number;
  streak: number;
  site: string;
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
const SIZE = 1080;

function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 3 && ctx.measureText(`${t}...`).width > maxWidth) t = t.slice(0, -1);
  return `${t}...`;
}

export function renderShareCard(info: ShareInfo, canvas: HTMLCanvasElement = document.createElement('canvas')): HTMLCanvasElement {
  canvas.width = SIZE;
  canvas.height = SIZE;
  const c = canvas.getContext('2d');
  if (!c) return canvas;

  const bg = c.createLinearGradient(0, 0, SIZE, SIZE);
  bg.addColorStop(0, '#0a1030');
  bg.addColorStop(1, '#341056');
  c.fillStyle = bg;
  c.fillRect(0, 0, SIZE, SIZE);

  // road with dashed centre line
  c.fillStyle = '#1c2340';
  c.fillRect(0, 700, SIZE, 190);
  c.fillStyle = '#ff3b6b';
  c.fillRect(0, 692, SIZE, 10);
  c.fillRect(0, 888, SIZE, 10);
  c.fillStyle = 'rgba(255,255,255,0.7)';
  for (let x = 20; x < SIZE; x += 120) c.fillRect(x, 792, 70, 8);

  const def = CARS.find((car) => car.id === info.car) ?? CARS[0];
  drawCar(c, 540, 700, 430, def, { wheelAngle: 0.5, flame: 0.7, time: 0.3, skin: info.skin });

  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  c.font = '900 84px system-ui, "Segoe UI", sans-serif';
  c.fillStyle = '#22d3ee';
  c.fillText('TYPE', 410, 120);
  c.fillStyle = '#ff4fa3';
  c.fillText('RUSH', 650, 120);

  c.fillStyle = '#c9d2ff';
  c.font = '600 34px system-ui, "Segoe UI", sans-serif';
  c.fillText(fit(c, `${info.name} - ${info.title}`, 940), 540, 185);

  c.fillStyle = '#ffffff';
  c.font = '900 200px system-ui, "Segoe UI", sans-serif';
  c.fillText(String(Math.round(info.wpm)), 540, 420);
  c.fillStyle = '#ffc233';
  c.font = '800 54px system-ui, "Segoe UI", sans-serif';
  c.fillText('WORDS PER MINUTE', 540, 490);

  const stats = [
    ['ACCURACY', `${info.accuracy.toFixed(1)}%`],
    ['PLACE', info.racers > 1 ? `${ORDINALS[info.position - 1] ?? `${info.position}th`} of ${info.racers}` : 'Solo'],
    ['POINTS', String(info.points)],
  ];
  stats.forEach(([label, value], i) => {
    const x = 220 + i * 320;
    c.fillStyle = '#8b97c9';
    c.font = '700 26px system-ui, "Segoe UI", sans-serif';
    c.fillText(label, x, 560);
    c.fillStyle = '#ffffff';
    c.font = '800 44px system-ui, "Segoe UI", sans-serif';
    c.fillText(value, x, 612);
  });

  c.fillStyle = '#c9d2ff';
  c.font = '700 34px system-ui, "Segoe UI", sans-serif';
  const streakText = info.streak > 1 ? `   |   ${info.streak} day streak` : '';
  c.fillText(`${DIFFICULTY_LABEL[info.difficulty]} race${streakText}`, 540, 960);
  c.fillStyle = '#ffffff';
  c.font = '800 40px system-ui, "Segoe UI", sans-serif';
  c.fillText('Can you beat me? Play free:', 540, 1010);
  c.fillStyle = '#22d3ee';
  c.font = '700 32px system-ui, "Segoe UI", sans-serif';
  c.fillText(fit(c, info.site, 940), 540, 1052);
  return canvas;
}

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled' | 'failed';

/** Shares the picture with the phone's share sheet when possible, otherwise downloads it. */
export async function shareResult(info: ShareInfo): Promise<ShareOutcome> {
  try {
    const canvas = renderShareCard(info);
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return 'failed';
    const file = new File([blob], 'typerush-result.png', { type: 'image/png' });
    const text = `I typed ${Math.round(info.wpm)} WPM on TypeRush! Can you beat me? ${info.site}`;
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: 'TypeRush result', text });
        return 'shared';
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      }
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'typerush-result.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}
