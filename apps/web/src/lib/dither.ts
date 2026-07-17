/**
 * Ordered (Bayer 8x8) dithering: turns a grayscale luminance field into
 * pure two-tone pixel art — blue ink on white paper.
 */

const BAYER_8: number[] = (() => {
  const m4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];
  const out: number[] = new Array(64);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const v = m4[y % 4]![x % 4]! * 4 + (Math.floor(y / 4) * 2 + Math.floor(x / 4));
      out[y * 8 + x] = (v + 0.5) / 64;
    }
  }
  return out;
})();

export interface DitherOptions {
  ink: [number, number, number];
  invert?: boolean;
  phase?: number;
}

export function ditherLuminance(
  src: ImageData,
  dst: ImageData,
  { ink, invert = false, phase = 0 }: DitherOptions,
): void {
  const s = src.data;
  const d = dst.data;
  const w = src.width;
  const h = src.height;
  const [ir, ig, ib] = ink;
  const px = Math.floor(phase) % 8;

  for (let y = 0; y < h; y++) {
    const row = ((y + px) % 8) * 8;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const alpha = s[i + 3]! / 255;
      let lum = (0.2126 * s[i]! + 0.7152 * s[i + 1]! + 0.0722 * s[i + 2]!) / 255;
      lum = lum * alpha + (1 - alpha);
      const darkness = invert ? lum : 1 - lum;
      const t = BAYER_8[row + ((x + px) % 8)]!;
      if (darkness > t) {
        d[i] = ir;
        d[i + 1] = ig;
        d[i + 2] = ib;
        d[i + 3] = 255;
      } else {
        d[i + 3] = 0;
      }
    }
  }
}

export const INK_BLUE: [number, number, number] = [51, 71, 224];
export const INK_WHITE: [number, number, number] = [255, 255, 255];
