/**
 * Orchestrator domain records — the API's in-memory view of a running
 * simulation. A `Recommendation` wraps an agent BET with its §28 lifecycle
 * state; a `BetRecord` is the on-chain bet it produced.
 */

import type {
  AgentDecision,
  MatchState,
  RecommendationState,
  ReplaySpeed,
  Selection,
} from "@wc/shared-types";

export type ReplayStatusName = "IDLE" | "RUNNING" | "PAUSED" | "COMPLETED";

export interface Recommendation {
  id: string;
  fixtureId: string;
  marketId: number;
  createdAt: number; // wall-clock ms
  expiresAt: number; // wall-clock ms (TTL)
  state: RecommendationState;
  decision: AgentDecision; // the BET that triggered it
  selection: Selection;
  /** Stake the user will place — starts at the suggested stake, adjustable. */
  stake: number;
  simulatedOdds: number;
  betId?: string;
  txSignature?: string;
  result?: "WON" | "LOST" | "VOID";
  payout?: number;
  settledAt?: number;
}

export interface BetRecord {
  id: string;
  recommendationId: string;
  fixtureId: string;
  marketId: number;
  selection: Selection;
  stake: number;
  odds: number;
  oddsBps: number;
  potentialPayout: number;
  state: RecommendationState; // RECORDED_ON_CHAIN | WON | LOST | VOID | CLAIMED
  placedAt: number;
  txSignature: string;
  settledAt?: number;
  payout?: number;
}

export interface FixtureView {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  status: ReplayStatusName;
  speed: ReplaySpeed;
  state: MatchState | null;
  marketId: number | null;
}

export interface PortfolioView {
  wallet: string;
  balance: number;
  staked: number;
  bets: BetRecord[];
  realisedPnl: number;
  dailyLoss: number;
}

/** Domain events broadcast to WebSocket subscribers. */
export type OrchestratorEvent =
  | { type: "state"; fixtureId: string; state: MatchState; status: ReplayStatusName }
  | { type: "replay"; fixtureId: string; status: ReplayStatusName; speed: ReplaySpeed }
  | { type: "recommendation"; recommendation: Recommendation }
  | { type: "bet"; bet: BetRecord }
  | { type: "settlement"; fixtureId: string; result: "WON" | "LOST" | "VOID"; recommendationId: string }
  | { type: "portfolio"; portfolio: PortfolioView };
