import type { Recommendation, ReplaySpeed } from "@/lib/types";

/** Featured live desk board — BRA vs ESP mid-second-half pressure. */
export const FEATURED_LIVE = {
  fixtureId: "18218149",
  /** ~42' match clock — 1-1, Spain carrying pressure */
  seekClock: 42 * 60,
  speed: 10 as ReplaySpeed,
  label: "Brazil vs Spain",
};

/** Hardcoded live bet plan so the desk never opens empty. */
export function seedLivePlan(now = Date.now()): Recommendation {
  const stake = 0.05;
  const odds = 8.13;
  return {
    id: "live-desk-esp",
    fixtureId: FEATURED_LIVE.fixtureId,
    matchLabel: "Brazil vs Spain",
    market: "1X2",
    selection: "Away",
    odds,
    confidence: 74,
    stake,
    payout: Math.round(stake * odds * 100) / 100,
    reason:
      "Plan: back Spain. Model 18% vs live market 12% (+6.0% edge). At 42' the score is 1-1 and Spain carries the recent pressure.",
    state: "AWAITING_CONFIRMATION",
    createdAt: now,
  };
}
