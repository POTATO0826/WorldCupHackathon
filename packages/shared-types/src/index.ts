/**
 * Shared domain types for the World Cup Betting Agent.
 *
 * These mirror the raw TxLINE feed shapes documented in the spec §9 and the
 * materialised MatchState in §10.2. Kept framework-free so every app/package
 * (replay-engine, agent-core, api, web) can depend on them without cycles.
 */

// ---------------------------------------------------------------------------
// Raw TxLINE envelopes (verbatim feed shapes) — spec §9.3 / §9.4
// ---------------------------------------------------------------------------

/** Every ndjson line is `{ id, data }` where id is the TxLINE SSE event id. */
export interface RawEnvelope<TData> {
  id: string;
  data: TData;
}

/** TxLINE score frame `data` payload. Only the fields we rely on are typed. */
export interface ScoreFrameData {
  FixtureId: number;
  Action: string;
  Seq?: number;
  Ts: number; // epoch ms
  StatusId?: number | null;
  Clock?: { Seconds?: number; Running?: boolean };
  Stats?: Record<string, number>;
  Confirmed?: boolean;
  Participant?: number;
  Participant1Id?: number;
  Participant2Id?: number;
  Participant1IsHome?: boolean;
  PossessionType?: string;
  GameState?: string;
  StartTime?: number;
  CompetitionId?: number;
  Data?: unknown;
}

/** TxLINE odds frame `data` payload. */
export interface OddsFrameData {
  FixtureId: number;
  Ts: number; // epoch ms
  Bookmaker?: string;
  BookmakerId?: number;
  SuperOddsType: string;
  MarketParameters?: string | null;
  MarketPeriod?: string | null;
  PriceNames?: string[];
  Prices?: number[];
  Pct?: string[];
  InRunning?: boolean;
}

export type ScoreEnvelope = RawEnvelope<ScoreFrameData>;
export type OddsEnvelope = RawEnvelope<OddsFrameData>;

// ---------------------------------------------------------------------------
// Feed constants — spec §9.3 (stat codes, statuses, high-value actions)
// ---------------------------------------------------------------------------

/** Base stat codes; period-prefixed codes are `period*1000 + base`. */
export const STAT_CODE = {
  TEAM1_GOALS: 1,
  TEAM2_GOALS: 2,
  TEAM1_YELLOW: 3,
  TEAM2_YELLOW: 4,
  TEAM1_RED: 5,
  TEAM2_RED: 6,
  TEAM1_CORNER: 7,
  TEAM2_CORNER: 8,
} as const;

/** Documented match phases (StatusId). Values beyond these are handled leniently. */
export const STATUS = {
  PRE_MATCH: 1,
  FIRST_HALF: 2,
  HALFTIME: 3,
  SECOND_HALF: 4,
  FULL_TIME: 5,
  // Observed beyond README: 6-10 = extra-time phases, 100 = finalised marker.
  FINALISED: 100,
} as const;

/** StatusIds at which the market is considered resolvable. */
export const TERMINAL_STATUS_IDS: ReadonlySet<number> = new Set([
  STATUS.FULL_TIME,
  STATUS.FINALISED,
]);

/** Actions that must freeze recommendations (spec §9.3, §11.5). */
export const FREEZE_ACTIONS: ReadonlySet<string> = new Set(["var", "possible"]);

// ---------------------------------------------------------------------------
// Materialised match state — spec §10.2
// ---------------------------------------------------------------------------

export type ReplaySpeed = 1 | 10 | 30 | 60;

export interface ClockState {
  seconds: number;
  running: boolean;
}

export interface MatchEvent {
  ts: number;
  action: string;
  statusId: number | null;
  confirmed?: boolean;
  participant?: number;
  seq?: number;
}

export interface Odds1x2 {
  home: number; // decimal odds
  draw: number;
  away: number;
  homePct?: number;
  drawPct?: number;
  awayPct?: number;
  ts: number;
}

export interface MatchStateFlags {
  varActive: boolean;
  unconfirmedGoal: boolean;
  dataStale: boolean;
  marketClosed: boolean;
}

export interface MatchState {
  fixtureId: string;
  statusId: number | null;
  clock: ClockState;
  score: { home: number; away: number };
  stats: Record<string, number>;
  recentEvents: MatchEvent[];
  odds1x2?: Odds1x2;
  flags: MatchStateFlags;
  updatedAt: number; // virtual ts
}

/** A single applied step in the merged replay timeline — spec §9.8. */
export interface MergedTick {
  fixtureId: string;
  ts: number;
  kind: "score" | "odds";
  payload: ScoreFrameData | OddsFrameData;
}

// ---------------------------------------------------------------------------
// Market / betting domain — spec §13.1
// ---------------------------------------------------------------------------

export enum Outcome {
  Pending = 0,
  Home = 1,
  Draw = 2,
  Away = 3,
}

export type Selection = "Home" | "Draw" | "Away";

export const SELECTION_TO_OUTCOME: Record<Selection, Outcome> = {
  Home: Outcome.Home,
  Draw: Outcome.Draw,
  Away: Outcome.Away,
};

// ---------------------------------------------------------------------------
// Fixture catalogue — spec §5 (names mapped locally), §9.2 (expected finals)
// ---------------------------------------------------------------------------

export interface FixtureMeta {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  homeParticipantId: number;
  awayParticipantId: number;
  startTime: number; // epoch ms
  competitionId: number;
  /** Expected final score from the dataset README — used as a settle fallback. */
  expectedFinalHome: number;
  expectedFinalAway: number;
  /** Notes from the dataset README (e.g. extra time, disconnect, red card). */
  note?: string;
}

export * from "./fixtures.js";
