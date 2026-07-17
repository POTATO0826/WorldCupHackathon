import {
  Outcome,
  type MatchState,
  type ScoreFrameData,
  type OddsFrameData,
  type MatchEvent,
} from "@wc/shared-types";

const RECENT_EVENTS_MAX = 25;

export function createInitialState(fixtureId: string): MatchState {
  return {
    fixtureId,
    statusId: null,
    clock: { seconds: 0, running: false },
    score: { home: 0, away: 0 },
    stats: {},
    recentEvents: [],
    odds1x2: undefined,
    flags: {
      varActive: false,
      unconfirmedGoal: false,
      dataStale: false,
      marketClosed: false,
    },
    updatedAt: 0,
  };
}

/**
 * Apply one score frame to the state.
 *
 * Score is read from cumulative Stats base codes 1/2. Per spec §9.7, unconfirmed
 * goals arrive carrying the OLD Stats (Confirmed:false) and a later Confirmed
 * frame updates Stats — so trusting the latest Stats always yields the correct
 * score. VAR / unconfirmed flags are tracked for the agent's SKIP gates (§11.5)
 * but do not distort the score itself.
 */
export function applyScoreFrame(state: MatchState, d: ScoreFrameData): MatchState {
  const action = String(d.Action ?? "");

  // Merge cumulative stats.
  if (d.Stats && typeof d.Stats === "object") {
    state.stats = { ...state.stats, ...d.Stats };
  }

  // Score from base codes 1/2 when present.
  const s1 = state.stats["1"];
  const s2 = state.stats["2"];
  if (typeof s1 === "number") state.score.home = s1;
  if (typeof s2 === "number") state.score.away = s2;

  // Phase + clock.
  if (d.StatusId !== undefined) state.statusId = d.StatusId ?? state.statusId;
  if (d.Clock) {
    if (typeof d.Clock.Seconds === "number") state.clock.seconds = d.Clock.Seconds;
    if (typeof d.Clock.Running === "boolean") state.clock.running = d.Clock.Running;
  }

  // Flag transitions (spec §9.3 / §11.5).
  if (action === "var") state.flags.varActive = true;
  if (action === "var_end") state.flags.varActive = false;
  if (action.includes("goal") && d.Confirmed === false) {
    state.flags.unconfirmedGoal = true;
  }
  if (action.includes("goal") && d.Confirmed === true) {
    state.flags.unconfirmedGoal = false;
  }
  if (action === "action_discarded" || action === "action_amend") {
    // A prior speculative event was withdrawn/corrected — clear the freeze.
    state.flags.unconfirmedGoal = false;
  }

  // Recent-events ring buffer.
  const ev: MatchEvent = {
    ts: d.Ts,
    action,
    statusId: d.StatusId ?? null,
    confirmed: d.Confirmed,
    participant: d.Participant,
    seq: d.Seq,
  };
  state.recentEvents.push(ev);
  if (state.recentEvents.length > RECENT_EVENTS_MAX) state.recentEvents.shift();

  state.flags.dataStale = false;
  state.updatedAt = d.Ts;
  return state;
}

/**
 * Apply one odds frame. Only match-level 1X2 rows update the bettable market
 * odds (spec §9.4: prefer MarketPeriod == null/empty). Price scale is /1000.
 */
export function applyOddsFrame(state: MatchState, d: OddsFrameData): MatchState {
  const isMatchLevel1x2 =
    d.SuperOddsType === "1X2_PARTICIPANT_RESULT" &&
    (d.MarketPeriod == null || d.MarketPeriod === "");
  if (!isMatchLevel1x2) return state;
  if (!d.Prices || d.Prices.length < 3) return state;

  const [p1, draw, p2] = d.Prices;
  if (typeof p1 !== "number" || typeof draw !== "number" || typeof p2 !== "number") {
    return state;
  }

  const pct = d.Pct;
  const toPct = (v: string | undefined): number | undefined => {
    if (v == null || v === "NA") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  state.odds1x2 = {
    home: p1 / 1000,
    draw: draw / 1000,
    away: p2 / 1000,
    homePct: toPct(pct?.[0]),
    drawPct: toPct(pct?.[1]),
    awayPct: toPct(pct?.[2]),
    ts: d.Ts,
  };
  state.updatedAt = d.Ts;
  return state;
}

export function outcomeFromScore(score: { home: number; away: number }): Outcome {
  if (score.home > score.away) return Outcome.Home;
  if (score.home < score.away) return Outcome.Away;
  return Outcome.Draw;
}
