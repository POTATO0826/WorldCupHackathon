/**
 * In-memory chain gateway — lets the whole product run (and be tested) with no
 * validator. It mirrors the `betting_market` program's observable behaviour:
 * one market per fixture, one bet per market per bettor, oracle-gated resolve,
 * and fixed-odds payout on claim. Signatures are deterministic fakes.
 */

import { Outcome, SELECTION_TO_OUTCOME, type Selection } from "@wc/shared-types";
import {
  oddsToBps,
  payoutWcdt,
  type ChainGateway,
  type ClaimResult,
  type EnsureMarketParams,
  type MarketRef,
  type PlaceBetParams,
  type PlaceBetResult,
  type ResolveResult,
} from "./gateway.js";

interface MockMarket {
  marketId: number;
  fixtureId: string;
  result: Outcome; // Pending until resolved
}

interface MockBet {
  marketId: number;
  bettor: string;
  selection: Selection;
  stakeWcdt: number;
  oddsBps: number;
  claimed: boolean;
}

const betKey = (marketId: number, bettor: string): string => `${marketId}:${bettor}`;

export class MockChainGateway implements ChainGateway {
  readonly kind = "mock" as const;

  private markets = new Map<number, MockMarket>();
  private marketByFixture = new Map<string, number>();
  private bets = new Map<string, MockBet>();
  private nextMarketId = 1;
  private sigCounter = 0;

  private sig(prefix: string): string {
    this.sigCounter += 1;
    return `mock_${prefix}_${this.sigCounter.toString().padStart(6, "0")}`;
  }

  async ensureMarket(params: EnsureMarketParams): Promise<MarketRef> {
    const existing = this.marketByFixture.get(params.fixtureId);
    if (existing !== undefined) {
      return { marketId: existing, marketPda: `mockmkt${existing}` };
    }
    const marketId = this.nextMarketId++;
    this.markets.set(marketId, { marketId, fixtureId: params.fixtureId, result: Outcome.Pending });
    this.marketByFixture.set(params.fixtureId, marketId);
    return { marketId, marketPda: `mockmkt${marketId}` };
  }

  async placeBet(params: PlaceBetParams): Promise<PlaceBetResult> {
    const market = this.markets.get(params.marketId);
    if (!market) throw new Error(`market ${params.marketId} does not exist`);
    if (market.result !== Outcome.Pending) throw new Error("market already resolved");
    const key = betKey(params.marketId, params.bettor);
    if (this.bets.has(key)) throw new Error("bet already exists for this market/bettor");
    if (params.stakeWcdt <= 0) throw new Error("stake must be positive");
    if (params.oddsBps < 10_000) throw new Error("odds must be >= 1.0");

    this.bets.set(key, {
      marketId: params.marketId,
      bettor: params.bettor,
      selection: params.selection,
      stakeWcdt: params.stakeWcdt,
      oddsBps: params.oddsBps,
      claimed: false,
    });
    return { signature: this.sig("bet"), betPda: `mockbet${key}` };
  }

  async resolveMarket(marketId: number, result: Outcome): Promise<ResolveResult> {
    const market = this.markets.get(marketId);
    if (!market) throw new Error(`market ${marketId} does not exist`);
    if (result === Outcome.Pending) throw new Error("cannot resolve to Pending");
    if (market.result !== Outcome.Pending) throw new Error("market already resolved");
    market.result = result;
    return { signature: this.sig("resolve") };
  }

  async claimWinnings(marketId: number, bettor: string): Promise<ClaimResult> {
    const market = this.markets.get(marketId);
    if (!market) throw new Error(`market ${marketId} does not exist`);
    if (market.result === Outcome.Pending) throw new Error("market not resolved");
    const bet = this.bets.get(betKey(marketId, bettor));
    if (!bet) throw new Error("no bet to claim");
    if (bet.claimed) throw new Error("already claimed");

    bet.claimed = true;
    const won = SELECTION_TO_OUTCOME[bet.selection] === market.result;
    const payout = won ? payoutWcdt(bet.stakeWcdt, bet.oddsBps) : 0;
    return { signature: this.sig("claim"), payoutWcdt: payout };
  }

  // --- test / inspection helpers ---
  marketResult(marketId: number): Outcome | undefined {
    return this.markets.get(marketId)?.result;
  }
}

export { oddsToBps };
