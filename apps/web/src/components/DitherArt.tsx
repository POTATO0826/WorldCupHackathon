import { useEffect, useRef } from "react";
import { ditherLuminance, INK_BLUE, INK_WHITE } from "@/lib/dither";

export type Painter = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
) => void;

interface DitherArtProps {
  painter: Painter;
  className?: string;
  /** logical pixel chunk size — bigger = chunkier dither */
  pixelSize?: number;
  animate?: boolean;
  whiteInk?: boolean;
  timeScale?: number;
}

/**
 * Renders a grayscale painter at low resolution, ordered-dithers it into
 * strict two-tone pixels, and upscales with crisp pixel edges.
 */
export default function DitherArt({
  painter,
  className,
  pixelSize = 3,
  animate = true,
  whiteInk = false,
  timeScale = 1,
}: DitherArtProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const painterRef = useRef(painter);
  painterRef.current = painter;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    let raf = 0;
    let running = true;
    let srcCanvas: HTMLCanvasElement | null = null;
    let srcCtx: CanvasRenderingContext2D | null = null;
    let dstData: ImageData | null = null;
    let lw = 0;
    let lh = 0;

    const visCtx = canvas.getContext("2d");
    if (!visCtx) return;

    const setup = () => {
      const w = Math.max(8, Math.floor(parent.clientWidth || parent.getBoundingClientRect().width));
      const h = Math.max(8, Math.floor(parent.clientHeight || parent.getBoundingClientRect().height));
      lw = Math.max(4, Math.floor(w / pixelSize));
      lh = Math.max(4, Math.floor(h / pixelSize));
      canvas.width = lw;
      canvas.height = lh;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      srcCanvas = document.createElement("canvas");
      srcCanvas.width = lw;
      srcCanvas.height = lh;
      srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true });
      dstData = new ImageData(lw, lh);
    };

    const draw = (tMs: number) => {
      if (!srcCtx || !dstData) return;
      const t = (tMs / 1000) * timeScale;
      srcCtx.clearRect(0, 0, lw, lh);
      painterRef.current(srcCtx, lw, lh, t);
      const src = srcCtx.getImageData(0, 0, lw, lh);
      ditherLuminance(src, dstData, {
        ink: whiteInk ? INK_WHITE : INK_BLUE,
        invert: whiteInk,
      });
      visCtx.putImageData(dstData, 0, 0);
    };

    setup();
    draw(0);

    if (animate) {
      const loop = (t: number) => {
        if (!running) return;
        draw(t);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    const ro = new ResizeObserver(() => {
      setup();
      draw(performance.now());
    });
    ro.observe(parent);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [pixelSize, animate, whiteInk, timeScale]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ imageRendering: "pixelated", display: "block" }}
      aria-hidden
    />
  );
}
