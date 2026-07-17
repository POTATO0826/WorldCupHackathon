import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import DitherArt, { type Painter } from "@/components/DitherArt";

const DURATION = 5.0;
const EASE = [0.76, 0, 0.24, 1] as const;
const INK = "rgb(51, 71, 224)";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
const easeInOut = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
const easeOutQuart = (t: number) => 1 - Math.pow(1 - clamp01(t), 4);

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  hot: boolean;
};

type SceneState = {
  elapsed: number;
  p: number;
  ballX: number;
  ballY: number;
  ballR: number;
  kickFlash: number;
  hitFlash: number;
  hitX: number;
  hitY: number;
  flying: boolean;
};

/**
 * Shared timeline so dither scene + undithered burn layer stay locked.
 * Painter draws grayscale ink (dark = blue after dither).
 * Overlay draws real RGB burn so sparkles stay bright on paper.
 */
type Geo = {
  ground: number;
  s: number;
  gx1: number;
  gx2: number;
  gTop: number;
  ix: number;
  iy: number;
  bulge: number;
  hitP: number;
  kickAt: number;
  flyStart: number;
  flyEnd: number;
  ballStart: { x: number; y: number };
  flyP: number;
};

function createScene() {
  const sparks: Spark[] = [];
  let start: number | null = null;
  let lastEmitKick = false;
  let lastEmitHit = false;
  let trailAcc = 0;
  let lastT = 0;
  let lastFrameKey = -1;
  let lastGeo: Geo | null = null;

  const state: SceneState = {
    elapsed: 0,
    p: 0,
    ballX: 0,
    ballY: 0,
    ballR: 4,
    kickFlash: 0,
    hitFlash: 0,
    hitX: 0,
    hitY: 0,
    flying: false,
  };

  const emitBurst = (
    x: number,
    y: number,
    count: number,
    power: number,
    hot = true,
  ) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.35;
      const sp = power * (0.55 + Math.random() * 1.1);
      sparks.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - power * 0.2,
        life: 0,
        max: 0.45 + Math.random() * 0.7,
        size: 1.6 + Math.random() * 3.2,
        hot,
      });
    }
  };

  const step = (t: number, w: number, h: number): Geo => {
    // one physics step per display frame (dither + burn RAFs share it)
    const frameKey = Math.floor(t * 60);
    if (lastGeo && frameKey === lastFrameKey) return lastGeo;
    lastFrameKey = frameKey;

    if (start == null) {
      start = t;
      lastT = t;
    }
    const dt = Math.min(0.05, Math.max(1 / 120, t - lastT || 1 / 60));
    lastT = t;

    const elapsed = t - start;
    const p = clamp01(elapsed / DURATION);
    const s = Math.min(w, h);
    const ground = h * 0.78;

    const gx1 = w * 0.62;
    const gx2 = w * 0.93;
    const gTop = h * 0.28;
    const ix = gx1 + (gx2 - gx1) * 0.2;
    const iy = gTop + (ground - gTop) * 0.26;

    const hitP = smooth((p - 0.56) / 0.14);
    const bulge =
      Math.sin(Math.min(1, hitP) * Math.PI) * s * 0.038 +
      (hitP >= 1 ? s * 0.014 : 0);

    const kickAt = 0.32;
    const flyStart = 0.33;
    const flyEnd = 0.58;

    const ballStart = { x: w * 0.32, y: ground - s * 0.025 };
    const flyP = easeOutQuart((p - flyStart) / (flyEnd - flyStart));
    const settleP = smooth((p - flyEnd) / 0.16);

    const bxFly = lerp(ballStart.x, ix, flyP);
    const arc = Math.sin(flyP * Math.PI) * s * 0.22;
    const byFly = lerp(ballStart.y, iy, flyP) - arc;

    const drawX = p < flyStart ? ballStart.x : flyP < 1 ? bxFly : ix + bulge * 0.7;
    const drawY =
      p < flyStart ? ballStart.y : flyP < 1 ? byFly : iy + settleP * s * 0.055;
    const ballR = s * 0.028;

    if (p >= kickAt && !lastEmitKick) {
      lastEmitKick = true;
      emitBurst(ballStart.x + s * 0.02, ballStart.y - s * 0.01, 80, s * 0.02, true);
    }
    if (p >= flyEnd && !lastEmitHit) {
      lastEmitHit = true;
      emitBurst(ix, iy, 120, s * 0.03, true);
    }

    const flying = flyP > 0.01 && flyP < 0.99;
    if (flying) {
      trailAcc += dt * 140;
      while (trailAcc >= 1) {
        trailAcc -= 1;
        const a = Math.PI + (Math.random() - 0.5) * 1.2;
        sparks.push({
          x: drawX + (Math.random() - 0.5) * ballR * 0.8,
          y: drawY + (Math.random() - 0.5) * ballR * 0.8,
          vx: Math.cos(a) * s * 0.008 * (0.7 + Math.random()),
          vy: Math.sin(a) * s * 0.006 * (0.7 + Math.random()) - s * 0.0015,
          life: 0,
          max: 0.35 + Math.random() * 0.4,
          size: 1.8 + Math.random() * 2.4,
          hot: true,
        });
      }
    }

    // lingering burn after net hit
    if (hitP > 0.05 && hitP < 0.85 && Math.random() < 0.45) {
      const a = Math.random() * Math.PI * 2;
      sparks.push({
        x: ix + Math.cos(a) * s * 0.02 * Math.random(),
        y: iy + Math.sin(a) * s * 0.02 * Math.random(),
        vx: Math.cos(a) * s * 0.01 * Math.random(),
        vy: Math.sin(a) * s * 0.01 * Math.random() - s * 0.004,
        life: 0,
        max: 0.4 + Math.random() * 0.5,
        size: 1.5 + Math.random() * 2.2,
        hot: true,
      });
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const sp = sparks[i]!;
      sp.life += dt;
      if (sp.life >= sp.max) {
        sparks.splice(i, 1);
        continue;
      }
      sp.x += sp.vx * dt * 60;
      sp.y += sp.vy * dt * 60;
      sp.vy += s * 0.00035 * dt * 60;
    }

    state.elapsed = elapsed;
    state.p = p;
    state.ballX = drawX;
    state.ballY = drawY;
    state.ballR = ballR;
    state.kickFlash = p >= kickAt ? 1 - clamp01((p - kickAt) / 0.22) : 0;
    state.hitFlash = hitP > 0 ? 1 - clamp01((p - flyEnd) / 0.55) : 0;
    state.hitX = ix;
    state.hitY = iy;
    state.flying = flying;

    lastGeo = {
      ground,
      s,
      gx1,
      gx2,
      gTop,
      ix,
      iy,
      bulge,
      hitP,
      kickAt,
      flyStart,
      flyEnd,
      ballStart,
      flyP,
    };
    return lastGeo;
  };

  const paintDither: Painter = (ctx, w, h, t) => {
    const geo = step(t, w, h);
    const { ground, s, gx1, gx2, gTop, ix, iy, bulge, kickAt, flyP, ballStart } =
      geo;
    const { p, ballX: drawX, ballY: drawY, ballR, elapsed } = state;

    const pitch = ctx.createLinearGradient(0, ground - s * 0.08, 0, h);
    pitch.addColorStop(0, "rgba(0,0,0,0)");
    pitch.addColorStop(1, "rgba(0,0,0,0.1)");
    ctx.fillStyle = pitch;
    ctx.fillRect(0, ground - s * 0.02, w, h - ground + s * 0.02);

    ctx.strokeStyle = "rgba(0,0,0,0.88)";
    ctx.lineWidth = Math.max(1.5, s * 0.007);
    ctx.beginPath();
    ctx.moveTo(w * 0.04, ground);
    ctx.lineTo(w * 0.96, ground);
    ctx.stroke();

    // net
    ctx.strokeStyle = "rgba(0,0,0,0.34)";
    ctx.lineWidth = Math.max(0.8, s * 0.0035);
    const cols = 12;
    const rows = 9;
    for (let i = 0; i <= cols; i++) {
      const fx = i / cols;
      ctx.beginPath();
      for (let j = 0; j <= rows; j++) {
        const fy = j / rows;
        let nx = gx1 + (gx2 - gx1) * fx + s * 0.045 * (1 - fy);
        let ny = gTop + (ground - gTop) * fy;
        const d = Math.hypot(nx - ix, ny - iy);
        const push = Math.max(0, 1 - d / (s * 0.16)) * bulge;
        nx += push;
        ny -= push * 0.35;
        j === 0 ? ctx.moveTo(nx, ny) : ctx.lineTo(nx, ny);
      }
      ctx.stroke();
    }
    for (let j = 0; j <= rows; j++) {
      const fy = j / rows;
      ctx.beginPath();
      for (let i = 0; i <= cols; i++) {
        const fx = i / cols;
        let nx = gx1 + (gx2 - gx1) * fx + s * 0.045 * (1 - fy);
        let ny = gTop + (ground - gTop) * fy;
        const d = Math.hypot(nx - ix, ny - iy);
        const push = Math.max(0, 1 - d / (s * 0.16)) * bulge;
        nx += push;
        ny -= push * 0.35;
        i === 0 ? ctx.moveTo(nx, ny) : ctx.lineTo(nx, ny);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = Math.max(2.8, s * 0.015);
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(gx1, ground);
    ctx.lineTo(gx1, gTop);
    ctx.lineTo(gx2, gTop);
    ctx.lineTo(gx2, ground);
    ctx.stroke();

    // motion-blur ghosts — denser trail for smoother flight read
    if (flyP > 0.01 && flyP < 1) {
      for (let k = 8; k >= 1; k--) {
        const fp = clamp01(flyP - k * 0.028);
        const gx = lerp(ballStart.x, ix, easeOutQuart(fp));
        const gy =
          lerp(ballStart.y, iy, fp) - Math.sin(fp * Math.PI) * s * 0.22;
        ctx.fillStyle = `rgba(0,0,0,${0.1 * (1 - k / 9)})`;
        ctx.beginPath();
        ctx.arc(gx, gy, ballR * (1 - k * 0.05), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // dotted flight path (fades with flight)
    if (flyP > 0.05) {
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      const steps = 18;
      for (let i = 0; i < steps; i++) {
        const fp = (i / steps) * flyP;
        if (fp > flyP - 0.02) break;
        const px = lerp(ballStart.x, ix, easeOutQuart(fp));
        const py =
          lerp(ballStart.y, iy, fp) - Math.sin(fp * Math.PI) * s * 0.22;
        ctx.beginPath();
        ctx.arc(px, py, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // striker — longer wind-up / follow-through for smoother kick
    const runEnd = 0.28;
    const runP = easeOutCubic(clamp01(p / runEnd));
    const kickP = easeInOut((p - (kickAt - 0.1)) / 0.22);
    const px = w * (0.05 + 0.2 * runP);
    const ph = s * 0.22;
    const stride = p < kickAt ? Math.sin(runP * Math.PI * 5.2) : 0;
    const lean = lerp(0.06, 0.42, smooth(kickP));

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = Math.max(3.2, s * 0.02);

    const hipX = px;
    const hipY = ground - ph * 0.42 + Math.abs(stride) * ph * 0.03;
    const shX = hipX + Math.sin(lean) * ph * 0.42;
    const shY = hipY - Math.cos(lean) * ph * 0.42;

    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(shX, shY);
    ctx.stroke();
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(
      shX + Math.sin(lean) * ph * 0.15,
      shY - Math.cos(lean) * ph * 0.15,
      ph * 0.115,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    const armSwing = p < kickAt ? stride * 0.55 : lerp(0.2, -0.95, smooth(kickP));
    ctx.beginPath();
    ctx.moveTo(shX, shY);
    ctx.lineTo(shX - ph * 0.32, shY + ph * (0.22 + armSwing * 0.2));
    ctx.moveTo(shX, shY);
    ctx.lineTo(shX + ph * 0.3, shY + ph * (0.18 - armSwing * 0.25));
    ctx.stroke();

    const plantSwing = p < kickAt ? -stride * 0.5 : 0.15;
    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(hipX + Math.sin(plantSwing) * ph * 0.22, ground);
    ctx.stroke();

    const swing =
      p < kickAt
        ? stride * 0.7
        : lerp(-1.2, 1.45, easeOutCubic(clamp01((p - (kickAt - 0.08)) / 0.2)));
    const kneeX = hipX + Math.sin(swing * 0.55) * ph * 0.3;
    const kneeY = hipY + Math.cos(swing * 0.55) * ph * 0.28;
    const footX = kneeX + Math.sin(swing) * ph * 0.32;
    const footY = kneeY + Math.cos(swing) * ph * 0.3;
    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(kneeX, kneeY);
    ctx.lineTo(footX, footY);
    ctx.stroke();

    if (p < kickAt) {
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      for (let k = 0; k < 5; k++) {
        const dx = px - ph * (0.22 + k * 0.1 + (elapsed * 2.2) % 0.1);
        ctx.beginPath();
        ctx.arc(dx, ground - 1, 1.2 + k * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // keeper — slower dive reads smoother against the flight
    const diveP = easeInOut(clamp01((p - 0.3) / 0.48));
    const kh = s * 0.18;
    const k0x = gx1 + (gx2 - gx1) * 0.48;
    const kx = k0x + diveP * (gx2 - k0x) * 0.58;
    const ky = ground - kh * 0.5 + diveP * kh * 0.34;
    const rot = diveP * 1.4;

    ctx.save();
    ctx.translate(kx, ky);
    ctx.rotate(rot);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = Math.max(3, s * 0.017);
    ctx.beginPath();
    ctx.moveTo(0, kh * 0.3);
    ctx.lineTo(0, -kh * 0.28);
    ctx.stroke();
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(0, -kh * 0.42, kh * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -kh * 0.2);
    ctx.lineTo(kh * (0.32 + diveP * 0.28), -kh * (0.42 + diveP * 0.22));
    ctx.moveTo(0, -kh * 0.16);
    ctx.lineTo(kh * (0.36 + diveP * 0.3), -kh * (0.26 + diveP * 0.18));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, kh * 0.3);
    ctx.lineTo(-kh * 0.24, kh * 0.58);
    ctx.moveTo(0, kh * 0.3);
    ctx.lineTo(kh * 0.16, kh * 0.6);
    ctx.stroke();
    ctx.restore();

    // ball — solid ink (survives dither)
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(drawX, drawY, ballR, 0, Math.PI * 2);
    ctx.fill();

    // dense ink spark cores so dither still shows burn clusters
    for (const sp of sparks) {
      const lifeT = sp.life / sp.max;
      const fade = 1 - lifeT;
      ctx.fillStyle = `rgba(0,0,0,${0.75 * fade})`;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.size * 0.55 * fade, 0, Math.PI * 2);
      ctx.fill();
    }

    // GOAL
    const goalP = smooth((p - 0.66) / 0.14);
    if (goalP > 0) {
      const scale = 0.72 + easeOutCubic(goalP) * 0.38;
      const pulse = 0.88 + Math.sin(elapsed * 12) * 0.12;
      ctx.save();
      ctx.translate(w * 0.4, h * 0.2);
      ctx.scale(scale * pulse, scale * pulse);
      ctx.fillStyle = "#000000";
      ctx.font = `bold ${s * 0.14}px "JetBrains Mono", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("GOAL!", 0, 0);
      ctx.restore();
    }
  };

  const paintBurn = (
    ctx: CanvasRenderingContext2D,
    cssW: number,
    cssH: number,
    logicalW: number,
    logicalH: number,
    t: number,
  ) => {
    step(t, logicalW, logicalH);
    ctx.clearRect(0, 0, cssW, cssH);
    const sx = cssW / logicalW;
    const sy = cssH / logicalH;
    const {
      ballX,
      ballY,
      ballR,
      kickFlash,
      hitFlash,
      hitX,
      hitY,
      flying,
      elapsed,
      p,
    } = state;

    ctx.save();
    ctx.scale(sx, sy);

    // bright ball — solid ink disk + white core (white alone vanishes on paper)
    if (p >= 0.28 && ballX > 1) {
      const burn = flying ? 1 : Math.max(kickFlash, hitFlash * 0.7, 0.45);
      const halo = ballR * (2.8 + burn * 2.2);

      ctx.fillStyle = `rgba(51,71,224,${0.22 * burn})`;
      ctx.beginPath();
      ctx.arc(ballX, ballY, halo, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(51,71,224,${0.45 * burn})`;
      ctx.beginPath();
      ctx.arc(ballX, ballY, halo * 0.55, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(ballX, ballY, ballR * 1.15, 0, Math.PI * 2);
      ctx.fill();
      // white sits on blue so it actually reads as "hot"
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(ballX, ballY, ballR * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(ballX + ballR * 0.18, ballY + ballR * 0.12, ballR * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }

    // kick flash ring — thick saturated blue
    if (kickFlash > 0) {
      const r = ballR * (2.4 + (1 - kickFlash) * 6);
      ctx.strokeStyle = `rgba(51,71,224,${0.95 * kickFlash})`;
      ctx.lineWidth = Math.max(3, ballR * 0.7 * kickFlash);
      ctx.beginPath();
      ctx.arc(ballX, ballY, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * kickFlash})`;
      ctx.lineWidth = Math.max(1.5, ballR * 0.35 * kickFlash);
      ctx.beginPath();
      ctx.arc(ballX, ballY, r * 0.72, 0, Math.PI * 2);
      ctx.stroke();
    }

    // goal impact burn — dense blue burst, white only on blue
    if (hitFlash > 0) {
      const R = ballR * (7 + hitFlash * 3);
      ctx.fillStyle = `rgba(51,71,224,${0.35 * hitFlash})`;
      ctx.beginPath();
      ctx.arc(hitX, hitY, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(51,71,224,${0.65 * hitFlash})`;
      ctx.beginPath();
      ctx.arc(hitX, hitY, R * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.95 * hitFlash})`;
      ctx.beginPath();
      ctx.arc(hitX, hitY, R * 0.18, 0, Math.PI * 2);
      ctx.fill();

      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * Math.PI * 2 + elapsed * 2.6;
        const r0 = ballR * 1.1;
        const r1 = ballR * (4 + hitFlash * 5);
        ctx.strokeStyle = `rgba(51,71,224,${0.95 * hitFlash})`;
        ctx.lineWidth = Math.max(2.2, ballR * 0.4);
        ctx.beginPath();
        ctx.moveTo(hitX + Math.cos(a) * r0, hitY + Math.sin(a) * r0);
        ctx.lineTo(hitX + Math.cos(a) * r1, hitY + Math.sin(a) * r1);
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${0.85 * hitFlash})`;
        ctx.lineWidth = Math.max(1, ballR * 0.18);
        ctx.beginPath();
        ctx.moveTo(hitX + Math.cos(a) * r0, hitY + Math.sin(a) * r0);
        ctx.lineTo(
          hitX + Math.cos(a) * (r0 + (r1 - r0) * 0.55),
          hitY + Math.sin(a) * (r0 + (r1 - r0) * 0.55),
        );
        ctx.stroke();
      }
    }

    // sparks: opaque blue body + white tip (readable on paper)
    ctx.lineCap = "round";
    for (const sp of sparks) {
      const lifeT = sp.life / sp.max;
      const fade = Math.pow(1 - lifeT, 0.45);
      const r = sp.size * (1.1 + fade * 0.6);
      const speed = Math.hypot(sp.vx, sp.vy) || 1;
      const tx = sp.x - (sp.vx / speed) * r * 3.6;
      const ty = sp.y - (sp.vy / speed) * r * 3.6;

      ctx.strokeStyle = `rgba(51,71,224,${0.95 * fade})`;
      ctx.lineWidth = Math.max(2.2, r * 0.85);
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();

      ctx.fillStyle = `rgba(51,71,224,${0.95 * fade})`;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${fade})`;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, Math.max(1.4, r * 0.48), 0, Math.PI * 2);
      ctx.fill();
    }

    // GOAL flash overlay
    const goalP = smooth((p - 0.66) / 0.14);
    if (goalP > 0) {
      const scale = 0.72 + easeOutCubic(goalP) * 0.38;
      const pulse = 0.88 + Math.sin(elapsed * 12) * 0.12;
      const ss = Math.min(logicalW, logicalH);
      ctx.save();
      ctx.translate(logicalW * 0.4, logicalH * 0.2);
      ctx.scale(scale * pulse, scale * pulse);
      ctx.strokeStyle = `rgba(255,255,255,${0.55 * goalP})`;
      ctx.lineWidth = Math.max(2, ss * 0.012);
      ctx.font = `bold ${ss * 0.14}px "JetBrains Mono", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.strokeText("GOAL!", 0, 0);
      ctx.restore();
    }

    ctx.restore();
  };

  return { paintDither, paintBurn, getLogical: () => state };
}

export default function GoalIntro({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const sceneRef = useRef(createScene());
  const burnRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), DURATION * 1000 + 400);
    const t2 = setTimeout(() => doneRef.current(), DURATION * 1000 + 1100);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  // undithered burn overlay — locked to dither scene state
  useEffect(() => {
    const canvas = burnRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    let raf = 0;
    let running = true;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const PIXEL = 1;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const loop = (tMs: number) => {
      if (!running) return;
      const rect = wrap.getBoundingClientRect();
      const cssW = rect.width;
      const cssH = rect.height;
      const lw = Math.max(4, Math.floor(cssW / PIXEL));
      const lh = Math.max(4, Math.floor(cssH / PIXEL));
      sceneRef.current.paintBurn(ctx, cssW, cssH, lw, lh, tMs / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const skip = () => {
    setLeaving(true);
    setTimeout(() => doneRef.current(), 450);
  };

  return (
    <AnimatePresence>
      {!leaving && (
        <motion.div
          key="goal-intro"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.55, ease: EASE }}
          onClick={skip}
          className="fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center bg-paper"
        >
          <div className="h-[62vh] w-full max-w-5xl px-4">
            <div ref={wrapRef} className="relative h-full w-full">
              <DitherArt
                painter={sceneRef.current.paintDither}
                pixelSize={1}
                timeScale={1}
              />
              <canvas
                ref={burnRef}
                className="pointer-events-none absolute inset-0 h-full w-full"
                aria-hidden
              />
            </div>
          </div>
          <p className="mt-4 font-mono text-[10px] tracking-[0.3em] text-blue-mid uppercase">
            click to skip
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
