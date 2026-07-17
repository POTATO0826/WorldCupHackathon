export interface Team {
  id: number;
  name: string;
  code: string;
}

export interface TimelineEvent {
  t: number; // seconds since capture start
  clock: number | null;
  run: boolean;
  status: number | null;
  action: string;
  p: number | null; // participant 1=home 2=away
  conf: boolean | null;
  h: number;
  a: number;
}

export interface OddsTick {
  t: number;
  h: number;
  d: number;
  a: number;
  live: boolean;
}

export interface Timeline {
  fixtureId: string;
  home: Team;
  away: Team;
  startTime: number;
  t0: number;
  durationSec: number;
  finalScore: { home: number; away: number };
  events: TimelineEvent[];
  odds: OddsTick[];
}

export interface FixtureSummary {
  fixtureId: string;
  home: Team;
  away: Team;
  startTime: number;
  durationSec: number;
  finalScore: { home: number; away: number };
  events: number;
  oddsTicks: number;
}

export type ReplaySpeed = 1 | 10 | 30 | 60;

export interface MatchState {
  fixtureId: string;
  score: { home: number; away: number };
  clock: number | null;
  running: boolean;
  status: number | null;
  odds: OddsTick | null;
  recent: TimelineEvent[];
  varActive: boolean;
  unconfirmedGoal: boolean;
  finished: boolean;
}

export type Selection = "Home" | "Draw" | "Away";

export type RecommendationState =
  | "CREATED"
  | "SENT"
  | "AWAITING_CONFIRMATION"
  | "CONFIRMED"
  | "REJECTED"
  | "EXPIRED"
  | "TRANSACTION_PENDING"
  | "RECORDED_ON_CHAIN"
  | "WON"
  | "LOST"
  | "VOID"
  | "CLAIMED";

export interface Recommendation {
  id: string;
  fixtureId: string;
  matchLabel: string;
  market: "1X2";
  selection: Selection;
  odds: number;
  confidence: number;
  stake: number;
  payout: number;
  reason: string;
  state: RecommendationState;
  createdAt: number;
  txHash?: string;
  finalScore?: { home: number; away: number };
  settledPayout?: number;
}

export interface AgentSkip {
  fixtureId: string;
  reason: string;
  at: number;
}

export type AgentMode = "conservative" | "balanced" | "aggressive";

export interface Preferences {
  minConfidence: number;
  maxStake: number;
  maxDailyLoss: number;
  mode: AgentMode;
  telegramEnabled: boolean;
  favouriteTeams: string[];
}
