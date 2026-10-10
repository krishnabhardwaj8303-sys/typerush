import { useEffect, useRef } from 'react';
import { drawRace, type RenderState } from './raceRenderer';

interface Props {
  /** Mutable object the owner updates every frame; read on each animation frame. */
  stateRef: { current: RenderState };
  lanes: number;
  label: string;
}

/** Responsive, DPI-aware canvas that redraws the race every animation frame. */
export function RaceCanvas({ stateRef, lanes, label }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return; // e.g. test environments: nothing to draw, no crash

    let width = 0;
    let height = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = Math.max(280, Math.round(rect.width));
      // Big race area: tall enough for several rows of winding road and U-turns.
      const ratio = width < 560 ? 1.0 : width < 820 ? 0.7 : 0.54;
      height = Math.round(Math.min(Math.max(width * ratio, 320), 540));
      canvas.style.height = `${height}px`;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(resize);
      observer.observe(canvas);
    } else {
      window.addEventListener('resize', resize);
    }

    let raf = 0;
    const frame = () => {
      drawRace(ctx, width, height, stateRef.current);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [lanes, stateRef]);

  return <canvas ref={canvasRef} className="race-canvas" role="img" aria-label={label} />;
}
