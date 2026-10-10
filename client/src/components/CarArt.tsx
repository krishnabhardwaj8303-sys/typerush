import { useEffect, useRef } from 'react';
import { CARS, type CarId } from '@typerush/shared';
import { drawCar } from '../render/raceRenderer';

interface Props {
  car: CarId;
  size?: number;
  animate?: boolean;
  className?: string;
}

/** Small canvas preview of a car (garage, lobby, podium). */
export function CarArt({ car, size = 120, animate = false, className }: Props) {
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
      });
      if (animate) raf = requestAnimationFrame(paint);
    };
    paint(start);
    if (animate) raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, [car, size, animate]);

  const name = CARS.find((c) => c.id === car)?.name ?? 'Car';
  return <canvas ref={ref} className={className} role="img" aria-label={`${name} car`} />;
}
