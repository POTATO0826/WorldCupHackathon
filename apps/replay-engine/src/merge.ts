import type { MergedTick, ScoreFrameData, OddsFrameData } from "@wc/shared-types";

/**
 * Build the merged replay timeline — spec §9.8.
 * Sort by Ts ascending; on ties, apply `score` before `odds` so match state is
 * up to date before odds derived from it are emitted. Array#sort is stable in
 * modern V8, preserving intra-kind ordering (already Seq/Ts-ordered on input).
 */
export function buildMergedTimeline(
  fixtureId: string,
  scores: ScoreFrameData[],
  odds: OddsFrameData[],
): MergedTick[] {
  const ticks: MergedTick[] = [];
  for (const d of scores) ticks.push({ fixtureId, ts: d.Ts, kind: "score", payload: d });
  for (const d of odds) ticks.push({ fixtureId, ts: d.Ts, kind: "odds", payload: d });

  ticks.sort((a, b) => {
    if (a.ts !== b.ts) return a.ts - b.ts;
    if (a.kind === b.kind) return 0;
    return a.kind === "score" ? -1 : 1;
  });
  return ticks;
}
