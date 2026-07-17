/**
 * Simulation orchestrator — the heart of the API (spec §28, §14, docs/SOLANA.md).
 *
 * Owns a `ReplayEngine` per fixture and drives the loop:
 *   replay tick -> PressureEdgeV1 -> (BET) create Recommendation
 *     -> user confirm -> place_bet on chain -> RECORDED_ON_CHAIN
 *     -> replay terminal -> oracle resolve_market -> settle WON/LOST
 *     -> user claim -> claim_winnings -> CLAIMED
 *
 * All bet/market side effects go through the injected `ChainGateway`, so the
 * same flow runs against the in-memory mock or a real Solana connection.
 * Everything is in-memory and single-wallet for the MVP.
 */

import { EventEmitter } from "node:events";
import { ReplayEngine, outcomeFromScore } from "@wc/replay-engine";
import {
  FIXTURES,
  FIXTURE_IDS,
  SELECTION_TO_OUTCOME,
  transition,
  type AgentContext,
  type MatchState,
  type RecommendationState,
  type ReplaySpeed,
  type UserPreferences,
} from "@wc/shared-types";
import { pressureEdgeV1, DEFAULT_PREFERENCES } from "@wc/agent-core";
import { oddsToBps, payoutWcdt, type ChainGateway } from "../chain/gateway.js";
import type {
  BetRecord,
  FixtureView,
  OrchestratorEvent,
  PortfolioView,
  Recommendation,
  ReplayStatusName,
} from "./types.js";

interface Session {
  fixtureId: string;
  engine: ReplayEngine;
  status: ReplayStatusName;
  speed: ReplaySpeed;
  marketId: number | null;
  activeRecommendationId: string | null;
  betPlaced: boolean;
  loaded: boolean;
}

export interface SimulationEngineOptions {
  chain: ChainGateway;
  preferences?: UserPreferences;
  ttlSeconds?: number;
  wallet?: string;
  startingBalance?: number;
  now?: () => number;
}

const DEFAULT_TTL_SECONDS = 300;
const DEFAULT_START_BALANCE = 1000;

export class SimulationEngine extends EventEmitter {
  private readonly chain: ChainGateway;
  private preferences: UserPreferences;
  private readonly ttlMs: number;
  private readonly wallet: string;
  private readonly now: () => number;

  private readonly sessions = new Map<string, Session>();
  private readonly recommendations = new Map<string, Recommendation>();
  private readonly bets = new Map<string, BetRecord>();

  private balance: number;
  private staked = 0;
  private realisedPnl = 0;
  private dailyLoss = 0;
  private recCounter = 0;
  private betCounter = 0;

  constructor(opts: SimulationEngineOptions) {
    super();
    this.chain = opts.chain;
    this.preferences = opts.preferences ?? { ...DEFAULT_PREFERENCES };
    this.ttlMs = (opts.ttlSeconds ?? DEFAULT_TTL_SECONDS) * 1000;
    this.wallet = opts.wallet ?? "SIM_WALLET";
    this.balance = opts.startingBalance ?? DEFAULT_START_BALANCE;
    this.now = opts.now ?? Date.now;
  }

  // --- preferences / wallet ------------------------------------------------

  getPreferences(): UserPreferences {
    return this.preferences;
  }

  setPreferences(next: Partial<UserPreferences>): UserPreferences {
    this.preferences = { ...this.preferences, ...next, requireConfirmation: true };
    return this.preferences;
  }

  faucet(amount = 1000): number {
    this.balance += amount;
    this.emitPortfolio();
    return this.balance;
  }

  // --- fixtures / sessions -------------------------------------------------

  listFixtures(): FixtureView[] {
    return FIXTURE_IDS.map((id) => this.fixtureView(id));
  }

  fixtureView(fixtureId: string): FixtureView {
    const meta = FIXTURES[fixtureId];
    if (!meta) throw new Error(`unknown fixture ${fixtureId}`);
    const session = this.sessions.get(fixtureId);
    return {
      fixtureId,
      homeTeam: meta.homeTeam,
      awayTeam: meta.awayTeam,
      status: session?.status ?? "IDLE",
      speed: session?.speed ?? 1,
      state: session?.loaded ? session.engine.state : null,
      marketId: session?.marketId ?? null,
    };
  }

  private async ensureSession(fixtureId: string): Promise<Session> {
    let session = this.sessions.get(fixtureId);
    if (session) return session;
    if (!FIXTURES[fixtureId]) throw new Error(`unknown fixture ${fixtureId}`);

    const engine = new ReplayEngine();
    session = {
      fixtureId,
      engine,
      status: "IDLE",
      speed: 1,
      marketId: null,
      activeRecommendationId: null,
      betPlaced: false,
      loaded: false,
    };
    this.sessions.set(fixtureId, session);

    engine.on("tick", (state: MatchState) => this.onTick(session!, state));
    engine.on("completed", (state: MatchState) => {
      void this.onCompleted(session!, state);
    });

    await engine.load(fixtureId);
    session.loaded = true;

    // Open the on-chain market for this fixture (oracle/admin side).
    const meta = FIXTURES[fixtureId]!;
    const market = await this.chain.ensureMarket({
      fixtureId,
      label: `${meta.homeTeam} v ${meta.awayTeam}`,
      opensAt: meta.startTime,
      closesAt: meta.startTime + 3 * 60 * 60 * 1000,
    });
    session.marketId = market.marketId;
    return session;
  }

  // --- replay controls -----------------------------------------------------

  async startReplay(fixtureId: string, speed: ReplaySpeed = 30): Promise<void> {
    const session = await this.ensureSession(fixtureId);
    if (session.status === "COMPLETED") return; // finished; use restart to replay
    session.speed = speed;
    session.engine.setSpeed(speed);
    session.status = "RUNNING";
    session.engine.start();
    this.emitReplay(session);
  }

  async pauseReplay(fixtureId: string): Promise<void> {
    const session = await this.ensureSession(fixtureId);
    session.engine.pause();
    session.status = "PAUSED";
    this.emitReplay(session);
  }

  async resumeReplay(fixtureId: string): Promise<void> {
    const session = await this.ensureSession(fixtureId);
    session.engine.resume();
    session.status = "RUNNING";
    this.emitReplay(session);
  }

  async setSpeed(fixtureId: string, speed: ReplaySpeed): Promise<void> {
    const session = await this.ensureSession(fixtureId);
    session.speed = speed;
    session.engine.setSpeed(speed);
    this.emitReplay(session);
  }

  /**
   * Deterministically advance a fixture (no wall-clock timer). Used by tests
   * and the "fast settle" demo path. Stops early when a new recommendation is
   * created so the caller can confirm it, unless `pauseOnRecommendation` false.
   */
  async stepToNextRecommendationOrEnd(
    fixtureId: string,
    pauseOnRecommendation = true,
  ): Promise<void> {
    const session = await this.ensureSession(fixtureId);
    if (session.status === "COMPLETED") return; // exhausted; don't reopen it
    session.status = "RUNNING";
    const before = this.recommendations.size;
    while (session.engine.stepOnce()) {
      if (pauseOnRecommendation && this.recommendations.size > before) {
        session.status = "PAUSED";
        return;
      }
    }
    // Loop exhausted the timeline; onCompleted has set status = COMPLETED.
  }

  // --- tick / recommendation loop -----------------------------------------

  private onTick(session: Session, state: MatchState): void {
    this.emit("event", {
      type: "state",
      fixtureId: session.fixtureId,
      state,
      status: session.status,
    } satisfies OrchestratorEvent);

    // Expire an outstanding recommendation past its TTL.
    const active = session.activeRecommendationId
      ? this.recommendations.get(session.activeRecommendationId)
      : null;
    if (active && active.state === "AWAITING_CONFIRMATION" && this.now() > active.expiresAt) {
      this.advance(active, "EXPIRED");
      session.activeRecommendationId = null;
    }

    if (session.betPlaced) return;
    if (session.activeRecommendationId) return; // one in flight

    const context: AgentContext = {
      now: state.updatedAt,
      availableBalance: this.balance,
      alreadyBet: session.betPlaced,
      dailyLoss: this.dailyLoss,
      marketClosed: session.status === "COMPLETED",
    };
    const decision = pressureEdgeV1.evaluate(state, this.preferences, context);
    if (decision.type !== "BET" || !decision.selection || session.marketId === null) return;

    const id = `rec_${++this.recCounter}`;
    const rec: Recommendation = {
      id,
      fixtureId: session.fixtureId,
      marketId: session.marketId,
      createdAt: this.now(),
      expiresAt: this.now() + this.ttlMs,
      state: "CREATED",
      decision,
      selection: decision.selection,
      stake: decision.suggestedStake,
      simulatedOdds: decision.simulatedOdds ?? 1,
    };
    this.recommendations.set(id, rec);
    session.activeRecommendationId = id;
    // Delivered + buttons active (no Telegram yet, so auto-advance).
    this.advance(rec, "SENT");
    this.advance(rec, "AWAITING_CONFIRMATION");
  }

  private async onCompleted(session: Session, state: MatchState): Promise<void> {
    session.status = "COMPLETED";
    this.emitReplay(session);

    const outcome = outcomeFromScore(state.score);

    // Oracle settles the market from the replayed final score.
    if (session.marketId !== null) {
      try {
        await this.chain.resolveMarket(session.marketId, outcome);
      } catch {
        // Already resolved or unavailable — settlement below is idempotent.
      }
    }

    // Expire any un-actioned recommendation.
    const active = session.activeRecommendationId
      ? this.recommendations.get(session.activeRecommendationId)
      : null;
    if (active && active.state === "AWAITING_CONFIRMATION") {
      this.advance(active, "EXPIRED");
      session.activeRecommendationId = null;
    }

    // Settle recorded bets for this fixture.
    for (const bet of this.bets.values()) {
      if (bet.fixtureId !== session.fixtureId) continue;
      if (bet.state !== "RECORDED_ON_CHAIN") continue;
      const won = SELECTION_TO_OUTCOME[bet.selection] === outcome;
      const result: "WON" | "LOST" = won ? "WON" : "LOST";
      bet.state = result;
      bet.settledAt = this.now();
      this.staked -= bet.stake;
      if (!won) {
        this.dailyLoss += bet.stake;
        this.realisedPnl -= bet.stake;
      }
      const rec = this.recommendations.get(bet.recommendationId);
      if (rec) {
        this.advance(rec, result);
        rec.result = result;
        rec.settledAt = bet.settledAt;
        this.emit("event", {
          type: "settlement",
          fixtureId: session.fixtureId,
          result,
          recommendationId: rec.id,
        } satisfies OrchestratorEvent);
      }
    }
    this.emitPortfolio();
  }

  // --- recommendation actions ---------------------------------------------

  getRecommendations(): Recommendation[] {
    return [...this.recommendations.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  getRecommendation(id: string): Recommendation | undefined {
    return this.recommendations.get(id);
  }

  changeStake(id: string, stake: number): Recommendation {
    const rec = this.requireRec(id);
    if (rec.state !== "AWAITING_CONFIRMATION") {
      throw new Error(`recommendation ${id} is not awaiting confirmation`);
    }
    if (stake <= 0) throw new Error("stake must be positive");
    // Self-loop (spec §28: AWAITING_CONFIRMATION -> AWAITING_CONFIRMATION).
    this.advance(rec, "AWAITING_CONFIRMATION");
    rec.stake = Math.min(stake, this.balance);
    return rec;
  }

  rejectRecommendation(id: string): Recommendation {
    const rec = this.requireRec(id);
    this.advance(rec, "REJECTED");
    const session = this.sessions.get(rec.fixtureId);
    if (session && session.activeRecommendationId === id) session.activeRecommendationId = null;
    return rec;
  }

  async confirmRecommendation(id: string, stakeOverride?: number): Promise<Recommendation> {
    const rec = this.requireRec(id);
    if (rec.state !== "AWAITING_CONFIRMATION") {
      throw new Error(`recommendation ${id} is not awaiting confirmation`);
    }
    if (stakeOverride !== undefined && stakeOverride !== rec.stake) {
      this.changeStake(id, stakeOverride);
    }
    if (rec.stake > this.balance) throw new Error("insufficient balance");

    const session = this.sessions.get(rec.fixtureId);
    if (!session || session.marketId === null) throw new Error("market not open");

    this.advance(rec, "CONFIRMED");
    this.advance(rec, "TRANSACTION_PENDING");

    const oddsBps = oddsToBps(rec.simulatedOdds);
    try {
      const res = await this.chain.placeBet({
        marketId: rec.marketId,
        bettor: this.wallet,
        selection: rec.selection,
        stakeWcdt: rec.stake,
        oddsBps,
      });
      this.advance(rec, "RECORDED_ON_CHAIN");
      rec.txSignature = res.signature;

      const betId = `bet_${++this.betCounter}`;
      const bet: BetRecord = {
        id: betId,
        recommendationId: rec.id,
        fixtureId: rec.fixtureId,
        marketId: rec.marketId,
        selection: rec.selection,
        stake: rec.stake,
        odds: rec.simulatedOdds,
        oddsBps,
        potentialPayout: payoutWcdt(rec.stake, oddsBps),
        state: "RECORDED_ON_CHAIN",
        placedAt: this.now(),
        txSignature: res.signature,
      };
      rec.betId = betId;
      this.bets.set(betId, bet);

      this.balance -= rec.stake;
      this.staked += rec.stake;
      session.betPlaced = true;
      session.activeRecommendationId = null;

      this.emit("event", { type: "bet", bet } satisfies OrchestratorEvent);
      this.emitPortfolio();
      return rec;
    } catch (err) {
      // Tx failed / rejected — back to awaiting so the user can retry (§28).
      this.advance(rec, "AWAITING_CONFIRMATION");
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  async claimWinnings(id: string): Promise<Recommendation> {
    const rec = this.requireRec(id);
    if (rec.state !== "WON") throw new Error("only won recommendations can be claimed");
    if (!rec.betId) throw new Error("no bet to claim");
    const bet = this.bets.get(rec.betId)!;

    const res = await this.chain.claimWinnings(rec.marketId, this.wallet);
    this.advance(rec, "CLAIMED");
    rec.payout = res.payoutWcdt;
    bet.state = "CLAIMED";
    bet.payout = res.payoutWcdt;

    this.balance += res.payoutWcdt;
    this.realisedPnl += res.payoutWcdt - bet.stake;

    this.emit("event", { type: "bet", bet } satisfies OrchestratorEvent);
    this.emitPortfolio();
    return rec;
  }

  // --- portfolio -----------------------------------------------------------

  getPortfolio(): PortfolioView {
    return {
      wallet: this.wallet,
      balance: this.balance,
      staked: this.staked,
      bets: [...this.bets.values()].sort((a, b) => b.placedAt - a.placedAt),
      realisedPnl: this.realisedPnl,
      dailyLoss: this.dailyLoss,
    };
  }

  onEvent(cb: (event: OrchestratorEvent) => void): () => void {
    this.on("event", cb);
    return () => this.off("event", cb);
  }

  // --- internals -----------------------------------------------------------

  private requireRec(id: string): Recommendation {
    const rec = this.recommendations.get(id);
    if (!rec) throw new Error(`unknown recommendation ${id}`);
    return rec;
  }

  /** Apply a validated §28 transition and broadcast the updated recommendation. */
  private advance(rec: Recommendation, to: RecommendationState): void {
    rec.state = transition(rec.state, to);
    this.emit("event", { type: "recommendation", recommendation: rec } satisfies OrchestratorEvent);
  }

  private emitReplay(session: Session): void {
    this.emit("event", {
      type: "replay",
      fixtureId: session.fixtureId,
      status: session.status,
      speed: session.speed,
    } satisfies OrchestratorEvent);
  }

  private emitPortfolio(): void {
    this.emit("event", { type: "portfolio", portfolio: this.getPortfolio() } satisfies OrchestratorEvent);
  }
}
