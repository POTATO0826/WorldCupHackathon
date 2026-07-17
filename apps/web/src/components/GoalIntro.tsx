import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import DitherArt, { type Painter } from "@/components/DitherArt";

const DURATION = 3.6; // seconds of scene time
const EASE = [0.76, 0, 0.24, 1] as const;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (v: number) => 1 - Math.pow(1 - v, 3);
const easeIn = (v: number) => v * v * v;

/**
 * One-shot dithered goal scene: striker runs in and shoots, the keeper
 * dives the wrong way, the net bulges, GOAL! flashes. Pure canvas,
 * two-tone dither like the rest of the app.
 */
function makeGoalPainter(): Painter {
  let start: number | null = null;

  return (ctx, w, h, t) => {
    if (start == null) start = t;
    const p = clamp01((t - start) / DURATION);

    const ground = h * 0.8;
    const s = Math.min(w, h); // scale unit

    // ---------- pitch ----------
    ctx.strokeStyle = "rgba(0,0,0,0.9)";
    ctx.lineWidth = Math.max(1.5, s * 0.008);
    ctx.beginPath();
    ctx.moveTo(0, ground);
    ctx.lineTo(w, ground);
    ctx.stroke();
    // penalty arc hint
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.arc(w * 0.28, ground, s * 0.18, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();

    // ---------- goal frame (right side) ----------
    const gx1 = w * 0.64; // near post
    const gx2 = w * 0.94; // far post
    const gTop = h * 0.3;
    const depth = s * 0.05; // perspective offset for net

    // impact point inside the goal (upper near corner)
    const ix = gx1 + (gx2 - gx1) * 0.22;
    const iy = gTop + (ground - gTop) * 0.28;

    // net bulge amount after impact
    const hitP = clamp01((p - 0.62) / 0.1);
    const bulge = Math.sin(Math.min(1, hitP) * Math.PI) * s * 0.03 + (hitP >= 1 ? s * 0.012 : 0);

    // net grid
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = Math.max(1, s * 0.004);
    const cols = 9;
    const rows = 7;
    for (let i = 0; i <= cols; i++) {
      const fx = i / cols;
      ctx.beginPath();
      for (let j = 0; j <= rows; j++) {
        const fy = j / rows;
        let nx = gx1 + (gx2 - gx1) * fx + depth * (1 - fy);
        let ny = gTop + (ground - gTop) * fy;
        const d = Math.hypot(nx - ix, ny - iy);
        const push = Math.max(0, 1 - d / (s * 0.14)) * bulge;
        nx += push;
        ny -= push * 0.3;
        j === 0 ? ctx.moveTo(nx, ny) : ctx.lineTo(nx, ny);
      }
      ctx.stroke();
    }
    for (let j = 0; j <= rows; j++) {
      const fy = j / rows;
      ctx.beginPath();
      for (let i = 0; i <= cols; i++) {
        const fx = i / cols;
        let nx = gx1 + (gx2 - gx1) * fx + depth * (1 - fy);
        let ny = gTop + (ground - gTop) * fy;
        const d = Math.hypot(nx - ix, ny - iy);
        const push = Math.max(0, 1 - d / (s * 0.14)) * bulge;
        nx += push;
        ny -= push * 0.3;
        i === 0 ? ctx.moveTo(nx, ny) : ctx.lineTo(nx, ny);
      }
      ctx.stroke();
    }
    // posts + crossbar on top of net
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = Math.max(2.5, s * 0.014);
    ctx.beginPath();
    ctx.moveTo(gx1, ground);
    ctx.lineTo(gx1, gTop);
    ctx.lineTo(gx2, gTop);
    ctx.lineTo(gx2, ground);
    ctx.stroke();

    // ---------- ball flight ----------
    // striker approach 0→0.3, kick at 0.32, ball flies 0.34→0.62, hit 0.62
    const ballStart = { x: w * 0.3, y: ground - s * 0.02 };
    const flyP = clamp01((p - 0.34) / 0.28);
    const bx = ballStart.x + (ix - ballStart.x) * easeOut(flyP);
    const arc = Math.sin(flyP * Math.PI) * s * 0.16;
    const by = ballStart.y + (iy - ballStart.y) * flyP - arc;
    const ballR = s * 0.022;

    // trail streaks while flying
    if (flyP > 0.03 && flyP < 1) {
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = Math.max(1, s * 0.006);
      for (let k = 1; k <= 3; k++) {
        const fp = clamp01(flyP - k * 0.07);
        const tx = ballStart.x + (ix - ballStart.x) * easeOut(fp);
        const ty = ballStart.y + (iy - ballStart.y) * fp - Math.sin(fp * Math.PI) * s * 0.16;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx - s * 0.03, ty + s * 0.008);
        ctx.stroke();
      }
    }

    // ball (rest → fly → settle in net)
    const settleP = clamp01((p - 0.62) / 0.12);
    const finalX = ix + bulge * 0.6;
    const finalY = iy + settleP * s * 0.05;
    const drawX = p < 0.34 ? ballStart.x : flyP < 1 ? bx : finalX;
    const drawY = p < 0.34 ? ballStart.y : flyP < 1 ? by : finalY;
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(drawX, drawY, ballR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(drawX - ballR * 0.25, drawY - ballR * 0.25, ballR * 0.35, 0, Math.PI * 2);
    ctx.fill();

    // ---------- striker (left, running in then kicking) ----------
    const runP = easeOut(clamp01(p / 0.3));
    const kickP = clamp01((p - 0.3) / 0.12);
    const px = w * (0.06 + 0.16 * runP);
    const py = ground;
    const ph = s * 0.2; // player height
    const lean = 0.15 + kickP * 0.2;

    ctx.strokeStyle = "#000000";
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(3, s * 0.018);

    const hipX = px;
    const hipY = py - ph * 0.45;
    const shX = hipX + Math.sin(lean) * ph * 0.4;
    const shY = hipY - Math.cos(lean) * ph * 0.4;
    // torso
    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(shX, shY);
    ctx.stroke();
    // head
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(shX + Math.sin(lean) * ph * 0.14, shY - Math.cos(lean) * ph * 0.14, ph * 0.11, 0, Math.PI * 2);
    ctx.fill();
    // arms (counter-swing)
    ctx.beginPath();
    ctx.moveTo(shX, shY);
    ctx.lineTo(shX - ph * 0.28, shY + ph * (0.1 - kickP * 0.18));
    ctx.moveTo(shX, shY);
    ctx.lineTo(shX + ph * 0.3, shY + ph * (0.28 - kickP * 0.3));
    ctx.stroke();
    // standing leg
    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(hipX - ph * 0.08, py);
    ctx.stroke();
    // kicking leg: cocked back → swung through
    const swing = -0.85 + easeOut(kickP) * 1.9; // radians relative to down
    const kneeX = hipX + Math.sin(swing * 0.5) * ph * 0.28;
    const kneeY = hipY + Math.cos(swing * 0.5) * ph * 0.28;
    const footX = kneeX + Math.sin(swing) * ph * 0.3;
    const footY = kneeY + Math.cos(swing) * ph * 0.3;
    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(kneeX, kneeY);
    ctx.lineTo(footX, footY);
    ctx.stroke();
    // run-up dust
    if (p < 0.32) {
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = Math.max(1, s * 0.006);
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.moveTo(px - ph * (0.35 + k * 0.16), py - ph * 0.06 * (k + 1) * 0.4);
        ctx.lineTo(px - ph * (0.55 + k * 0.16), py - ph * 0.06 * (k + 1) * 0.4);
        ctx.stroke();
      }
    }

    // ---------- goalkeeper (dives the wrong way) ----------
    const diveP = easeIn(clamp01((p - 0.36) / 0.3));
    const kh = s * 0.17;
    const k0x = gx1 + (gx2 - gx1) * 0.5;
    // keeper moves low toward the far post while the ball goes near-top
    const kx = k0x + diveP * (gx2 - k0x) * 0.55;
    const kyBase = ground - kh * 0.5;
    const ky = kyBase + diveP * kh * 0.28;
    const rot = diveP * 1.25; // rotate toward horizontal

    ctx.save();
    ctx.translate(kx, ky);
    ctx.rotate(rot);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = Math.max(3, s * 0.016);
    // body
    ctx.beginPath();
    ctx.moveTo(0, kh * 0.32);
    ctx.lineTo(0, -kh * 0.3);
    ctx.stroke();
    // head
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(0, -kh * 0.44, kh * 0.13, 0, Math.PI * 2);
    ctx.fill();
    // arms stretched (both up-forward while diving)
    ctx.beginPath();
    ctx.moveTo(0, -kh * 0.22);
    ctx.lineTo(kh * (0.3 + diveP * 0.25), -kh * (0.45 + diveP * 0.2));
    ctx.moveTo(0, -kh * 0.18);
    ctx.lineTo(kh * (0.34 + diveP * 0.28), -kh * (0.28 + diveP * 0.15));
    ctx.stroke();
    // legs
    ctx.beginPath();
    ctx.moveTo(0, kh * 0.32);
    ctx.lineTo(-kh * 0.22, kh * 0.6);
    ctx.moveTo(0, kh * 0.32);
    ctx.lineTo(kh * 0.14, kh * 0.62);
    ctx.stroke();
    ctx.restore();

    // ---------- impact flash + GOAL! ----------
    if (hitP > 0) {
      // radial impact ticks
      const flick = 1 - clamp01((p - 0.62) / 0.2);
      if (flick > 0) {
        ctx.strokeStyle = `rgba(0,0,0,${0.7 * flick})`;
        ctx.lineWidth = Math.max(1.5, s * 0.008);
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + 0.3;
          ctx.beginPath();
          ctx.moveTo(ix + Math.cos(a) * s * 0.035, iy + Math.sin(a) * s * 0.035);
          ctx.lineTo(ix + Math.cos(a) * s * (0.05 + flick * 0.035), iy + Math.sin(a) * s * (0.05 + flick * 0.035));
          ctx.stroke();
        }
      }
    }
    const goalP = clamp01((p - 0.72) / 0.1);
    if (goalP > 0) {
      const blink = p > 0.95 || Math.floor(p * 16) % 3 !== 0;
      if (blink) {
        ctx.fillStyle = "#000000";
        ctx.font = `bold ${s * 0.13 * (0.8 + easeOut(goalP) * 0.2)}px "JetBrains Mono", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("GOAL!", w * 0.42, h * 0.22);
      }
    }
  };
}

export default function GoalIntro({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const painterRef = useRef<Painter>(makeGoalPainter());
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), DURATION * 1000 + 500);
    const t2 = setTimeout(() => doneRef.current(), DURATION * 1000 + 1200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const skip = () => {
    setLeaving(true);
    setTimeout(() => doneRef.current(), 500);
  };

  return (
    <AnimatePresence>
      {!leaving && (
        <motion.div
          key="goal-intro"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          onClick={skip}
          className="fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center bg-paper"
        >
          <div className="h-[58vh] w-full max-w-4xl px-6">
            <DitherArt painter={painterRef.current} pixelSize={3} timeScale={1} />
          </div>
          <p className="mt-4 font-mono text-[10px] tracking-[0.3em] text-blue-mid uppercase">
            click to skip
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
