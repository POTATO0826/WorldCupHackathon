import type { MatchState, Preferences, Selection, Timeline, TimelineEvent } from "@/lib/types";

export interface AgentDecision {
  type: "BET" | "SKIP";
  selection?: Selection;
  confidence: number;
  stake: number;
  odds: number;
  payout: number;
  reason: string;
  skipReason?: string;
  features: Record<string, string | number | boolean>;
}

const MODE_FACTOR = { conservative: 0.5, balanced: 1, aggressive: 1.25 } as const;
const MODE_EDGE = { conservative: 0.08, balanced: 0.05, aggressive: 0.03 } as const;

function windowCount(recent: TimelineEvent[], action: string, side: 1 | 2): number {
  return recent.filter((e) => e.action === action && e.p === side).length;
}

/**
 * PressureEdgeV1 — rule-based strategy from the spec: builds a model
 * probability from recent pressure + score state and compares it against
 * the simulated market's implied probability.
 */
export function evaluate(
  state: MatchState,
  prefs: Preferences,
  timeline: Timeline,
  balance: number,
  dailyLoss: number,
): AgentDecision {
  const empty = { confidence: 0, stake: 0, odds: 0, payout: 0 };

  const skip = (skipReason: string, features: AgentDecision["features"] = {}): AgentDecision => ({
    type: "SKIP",
    ...empty,
    reason: skipReason,
    skipReason,
    features,
  });

  if (state.varActive) return skip("VAR review in progress — waiting for the decision.");
  if (state.unconfirmedGoal) return skip("A goal is awaiting confirmation.");
  if (!state.odds) return skip("Live odds unavailable for this market.");
  if (state.finished || (state.status ?? 0) >= 5) return skip("Market closed — match is over.");
  if (dailyLoss >= prefs.maxDailyLoss) return skip("Daily virtual loss limit reached.");

  const { h: oh, d: od, a: oa } = state.odds;
  // implied market probabilities (normalised)
  const inv = 1 / oh + 1 / od + 1 / oa;
  const mkt = { home: 1 / oh / inv, draw: 1 / od / inv, away: 1 / oa / inv };

  // pressure features from the recent event window
  const rec = state.recent;
  const shotsH = windowCount(rec, "shot", 1);
  const shotsA = windowCount(rec, "shot", 2);
  const dangerH = windowCount(rec, "danger_possession", 1) + 2 * windowCount(rec, "high_danger_possession", 1);
  const dangerA = windowCount(rec, "danger_possession", 2) + 2 * windowCount(rec, "high_danger_possession", 2);
  const cornersH = windowCount(rec, "corner", 1);
  const cornersA = windowCount(rec, "corner", 2);
  const redsH = windowCount(rec, "red_card", 1);
  const redsA = windowCount(rec, "red_card", 2);

  const pressureH = shotsH * 2 + dangerH + cornersH * 1.5 - redsH * 4;
  const pressureA = shotsA * 2 + dangerA + cornersA * 1.5 - redsA * 4;
  const pressureEdge = (pressureH - pressureA) / Math.max(6, pressureH + pressureA + 4);

  // score/time context
  const minute = (state.clock ?? 0) / 60;
  const lead = state.score.home - state.score.away;
  const timeWeight = Math.min(1, minute / 90);

  // model probabilities: nudge the market by pressure + scoreline conviction
  let mh = mkt.home + pressureEdge * 0.12 + lead * 0.06 * timeWeight;
  let ma = mkt.away - pressureEdge * 0.12 - lead * 0.06 * timeWeight;
  let md = 1 - mh - ma;
  // clamp + renormalise
  mh = Math.max(0.02, Math.min(0.95, mh));
  ma = Math.max(0.02, Math.min(0.95, ma));
  md = Math.max(0.02, Math.min(0.95, md));
  const tot = mh + md + ma;
  mh /= tot; md /= tot; ma /= tot;

  const edges: Array<{ sel: Selection; edge: number; model: number; market: number; odds: number }> = [
    { sel: "Home", edge: mh - mkt.home, model: mh, market: mkt.home, odds: oh },
    { sel: "Draw", edge: md - mkt.draw, model: md, market: mkt.draw, odds: od },
    { sel: "Away", edge: ma - mkt.away, model: ma, market: mkt.away, odds: oa },
  ];
  edges.sort((x, y) => y.edge - x.edge);
  const best = edges[0]!;

  const features: AgentDecision["features"] = {
    minute: Math.round(minute),
    score: `${state.score.home}-${state.score.away}`,
    shots: `${shotsH}/${shotsA}`,
    danger: `${dangerH}/${dangerA}`,
    corners: `${cornersH}/${cornersA}`,
    marketProb: `${(best.market * 100).toFixed(1)}%`,
    modelProb: `${(best.model * 100).toFixed(1)}%`,
    edge: `${(best.edge * 100).toFixed(1)}%`,
    selection: best.sel,
  };

  const edgeFloor = MODE_EDGE[prefs.mode];
  if (best.edge < edgeFloor) {
    return skip(
      `No value edge found (best ${(best.edge * 100).toFixed(1)}% on ${best.sel}, needs ${(edgeFloor * 100).toFixed(0)}%).`,
      features,
    );
  }

  const confidence = Math.round(Math.min(95, 50 + best.edge * 260 + best.model * 25));
  if (confidence < prefs.minConfidence) {
    return skip(`Confidence ${confidence}% is below your ${prefs.minConfidence}% threshold.`, features);
  }

  const rawStake = prefs.maxStake * (confidence / 100) * MODE_FACTOR[prefs.mode];
  const stake = Math.max(
    0.05,
    Math.round(Math.min(rawStake, prefs.maxStake, balance * 0.1) * 100) / 100,
  );
  const payout = Math.round(stake * best.odds * 100) / 100;

  const sideName =
    best.sel === "Home" ? timeline.home.name : best.sel === "Away" ? timeline.away.name : "the draw";
  const pressureNote =
    pressureEdge > 0.08
      ? `${timeline.home.name} carries the recent pressure`
      : pressureEdge < -0.08
        ? `${timeline.away.name} carries the recent pressure`
        : "pressure is balanced";

  return {
    type: "BET",
    selection: best.sel,
    confidence,
    stake,
    odds: best.odds,
    payout,
    reason:
      `Plan: back ${sideName}. Model ${(best.model * 100).toFixed(0)}% vs live market ` +
      `${(best.market * 100).toFixed(0)}% (+${(best.edge * 100).toFixed(1)}% edge). ` +
      `At ${Math.round(minute)}' the score is ${state.score.home}-${state.score.away} and ${pressureNote}.`,
    features,
  };
}
