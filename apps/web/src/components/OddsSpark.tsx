import type { OddsTick } from "@/lib/types";

/** Inline SVG sparkline of the 1X2 odds up to the replay cursor. */
export default function OddsSpark({
  odds,
  cursor,
  height = 120,
}: {
  odds: OddsTick[];
  cursor: number;
  height?: number;
}) {
  const visible = odds.filter((o) => o.t <= cursor && o.h != null && o.d != null && o.a != null);
  if (visible.length < 2) {
    return (
      <div
        className="flex items-center justify-center font-mono text-[11px] text-blue-mid"
        style={{ height }}
      >
        waiting for odds ticks…
      </div>
    );
  }

  const w = 600;
  const pad = 6;
  const tMin = visible[0]!.t;
  const tMax = Math.max(visible[visible.length - 1]!.t, tMin + 1);
  const all = visible.flatMap((o) => [o.h, o.d, o.a]).filter((v) => v < 15);
  const vMin = Math.min(...all);
  const vMax = Math.max(...all);

  const x = (t: number) => pad + ((t - tMin) / (tMax - tMin)) * (w - pad * 2);
  const y = (v: number) =>
    height - pad - ((Math.min(v, 15) - vMin) / Math.max(0.01, vMax - vMin)) * (height - pad * 2);

  const path = (key: "h" | "d" | "a") =>
    visible.map((o, i) => `${i === 0 ? "M" : "L"}${x(o.t).toFixed(1)},${y(o[key]).toFixed(1)}`).join(" ");

  const last = visible[visible.length - 1]!;

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${height}`} className="block w-full" style={{ height }}>
        <path d={path("h")} fill="none" stroke="#3347e0" strokeWidth="2" />
        <path d={path("d")} fill="none" stroke="#aeb7f4" strokeWidth="2" strokeDasharray="4 3" />
        <path d={path("a")} fill="none" stroke="#101c66" strokeWidth="2" />
      </svg>
      <div className="mt-2 flex gap-5 font-mono text-[11px]">
        <span className="text-blue">— HOME {last.h.toFixed(2)}</span>
        <span className="text-blue-soft">-- DRAW {last.d.toFixed(2)}</span>
        <span className="text-blue-ink">— AWAY {last.a.toFixed(2)}</span>
      </div>
    </div>
  );
}
