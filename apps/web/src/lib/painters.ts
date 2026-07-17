import type { Painter } from "@/components/DitherArt";

/**
 * Rotating dithered football — a shaded sphere carrying the classic
 * pentagon patches of a World Cup match ball. Pentagon centres are the
 * 12 vertices of an icosahedron, rotated in 3D and projected.
 */
export const footballPainter: Painter = (ctx, w, h, t) => {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.42;

  // shaded sphere body (light drifts like the SafeSend orb)
  const lightX = cx - r * 0.4;
  const lightY = cy - r * 0.45;
  const g = ctx.createRadialGradient(lightX, lightY, r * 0.1, cx, cy, r * 1.18);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.55, "#9a9a9a");
  g.addColorStop(1, "#101010");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // icosahedron vertices = pentagon patch centres
  const phi = (1 + Math.sqrt(5)) / 2;
  const raw: [number, number, number][] = [
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
    [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
    [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
  ];
  const norm = Math.hypot(1, phi);
  const ry = t * 0.5; // spin
  const rx = 0.42; // fixed tilt
  const cosY = Math.cos(ry), sinY = Math.sin(ry);
  const cosX = Math.cos(rx), sinX = Math.sin(rx);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.985, 0, Math.PI * 2);
  ctx.clip();

  for (const [vx0, vy0, vz0] of raw) {
    const vx = vx0 / norm, vy = vy0 / norm, vz = vz0 / norm;
    // rotate Y then X
    const x1 = vx * cosY + vz * sinY;
    const z1 = -vx * sinY + vz * cosY;
    const y2 = vy * cosX - z1 * sinX;
    const z2 = vy * sinX + z1 * cosX;
    if (z2 < 0.05) continue; // back side

    const px = cx + x1 * r;
    const py = cy + y2 * r;
    const size = r * 0.30 * z2; // shrink toward limb

    // pentagon oriented to slowly spin with the ball
    ctx.fillStyle = `rgba(0,0,0,${0.55 + z2 * 0.45})`;
    ctx.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + ry * 0.6;
      const ex = px + Math.cos(a) * size;
      const ey = py + Math.sin(a) * size * (0.55 + z2 * 0.45);
      if (k === 0) ctx.moveTo(ex, ey);
      else ctx.lineTo(ex, ey);
    }
    ctx.closePath();
    ctx.fill();

    // seams radiating to neighbouring hexagons
    ctx.strokeStyle = `rgba(0,0,0,${0.25 + z2 * 0.3})`;
    ctx.lineWidth = Math.max(1, r * 0.03);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + ry * 0.6 + Math.PI / 5;
      ctx.beginPath();
      ctx.moveTo(px + Math.cos(a) * size, py + Math.sin(a) * size * (0.55 + z2 * 0.45));
      ctx.lineTo(px + Math.cos(a) * size * 1.9, py + Math.sin(a) * size * (0.55 + z2 * 0.45) * 1.9);
      ctx.stroke();
    }
  }
  ctx.restore();

  // limb darkening ring keeps the silhouette crisp after dithering
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.lineWidth = Math.max(1.5, r * 0.035);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
};

/** World Cup trophy silhouette with a breathing glow. */
export const trophyPainter: Painter = (ctx, w, h, t) => {
  const cx = w / 2;
  const cy = h / 2;
  const s = Math.min(w, h) * 0.4;
  const pulse = 0.85 + Math.sin(t * 1.2) * 0.15;

  const g = ctx.createRadialGradient(cx, cy - s * 0.3, s * 0.1, cx, cy, s * 1.5);
  g.addColorStop(0, `rgba(0,0,0,${0.5 * pulse})`);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#000000";
  // globe on top
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.52, s * 0.34, 0, Math.PI * 2);
  ctx.fill();
  // swooping body
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.34, cy - s * 0.42);
  ctx.quadraticCurveTo(cx - s * 0.62, cy + s * 0.05, cx - s * 0.16, cy + s * 0.42);
  ctx.lineTo(cx + s * 0.16, cy + s * 0.42);
  ctx.quadraticCurveTo(cx + s * 0.62, cy + s * 0.05, cx + s * 0.34, cy - s * 0.42);
  ctx.closePath();
  ctx.fill();
  // base
  ctx.fillRect(cx - s * 0.3, cy + s * 0.42, s * 0.6, s * 0.16);
  ctx.fillRect(cx - s * 0.42, cy + s * 0.58, s * 0.84, s * 0.18);
  // white shine on the globe
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(cx - s * 0.12, cy - s * 0.62, s * 0.09, 0, Math.PI * 2);
  ctx.fill();
};

/** Concentric expanding ripple rings (signal / broadcast motif). */
export const ringsPainter: Painter = (ctx, w, h, t) => {
  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.min(w, h) * 0.48;
  for (let i = 0; i < 7; i++) {
    const phase = (t * 0.25 + i / 7) % 1;
    const r = phase * maxR;
    const alpha = (1 - phase) * 0.9;
    ctx.strokeStyle = `rgba(0,0,0,${alpha})`;
    ctx.lineWidth = Math.max(1.5, maxR * 0.06 * (1 - phase));
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(0,0,0,0.85)";
  ctx.beginPath();
  ctx.arc(cx, cy, maxR * 0.08, 0, Math.PI * 2);
  ctx.fill();
};

/** Coin disc with a currency glyph — simulated SOL. */
export function coinPainter(glyph: string): Painter {
  return (ctx, w, h, t) => {
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) * 0.44;
    const squeeze = 0.82 + Math.abs(Math.sin(t * 0.8)) * 0.18;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(squeeze, 1);
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r * 1.2);
    g.addColorStop(0, "#666666");
    g.addColorStop(1, "#000000");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = Math.max(1.5, r * 0.06);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${r * 0.72}px "JetBrains Mono", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(glyph, 0, r * 0.06);
    ctx.restore();
  };
}
