import { useEffect, useRef } from 'react';
import { CARS, type CarId } from '@typerush/shared';
import { drawCar, drawTrail } from '../render/raceRenderer';
import type { SkinId, TrailId } from '../lib/shop';

interface Props {
  car: CarId;
  size?: number;
  animate?: boolean;
  className?: string;
  skin?: SkinId;
}

/** Small canvas preview of a car (garage, lobby, podium). */
export function CarArt({ car, size = 120, animate = false, className, skin }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = size;
    const h = Math.round(size * 0.52);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const def = CARS.find((c) => c.id === car) ?? CARS[0];

    let raf = 0;
    const start = performance.now();
    const paint = (now: number) => {
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, w, h);
      drawCar(ctx, w / 2, h * 0.5, w * 0.8, def, {
        wheelAngle: animate ? t * 9 : 0.4,
        flame: animate ? 0.5 + 0.4 * Math.sin(t * 6) : 0,
        time: t,
        skin,
      });
      if (animate) raf = requestAnimationFrame(paint);
    };
    paint(start);
    if (animate) raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, [car, size, animate, skin]);

  const name = CARS.find((c) => c.id === car)?.name ?? 'Car';
  return <canvas ref={ref} className={className} role="img" aria-label={`${name} car`} />;
}

/** Small preview of a trail style behind a car (garage shop). */
export function TrailPreview({ trail, car, skin }: { trail: TrailId; car: CarId; skin?: SkinId }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = 200;
    const h = 64;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const def = CARS.find((c) => c.id === car) ?? CARS[0];
    ctx.clearRect(0, 0, w, h);
    const pts = [];
    for (let k = 1; k <= 14; k++) pts.push({ x: 150 - k * 8.5, y: h / 2 });
    drawTrail(ctx, trail, pts, 26, 0.35);
    drawCar(ctx, 160, h / 2, 56, def, { wheelAngle: 0.4, skin });
  }, [trail, car, skin]);

  return <canvas ref={ref} role="img" aria-label="Trail preview" />;
}
