/**
 * Chain gateway — the seam between the simulation orchestrator and Solana.
 *
 * The orchestrator only ever talks to this interface, so the same replay/agent/
 * settlement flow runs against an in-memory `MockChainGateway` (default, no
 * validator needed) or a real `SolanaChainGateway` (Phase 3b follow-up) that
 * signs `place_bet` / `resolve_market` / `claim_winnings` against the deployed
 * `betting_market` program (docs/SOLANA.md).
 *
 * Amounts are whole WCDT for readability; a real gateway converts to 6-decimal
 * base units at the boundary. `oddsBps` is decimal odds * 10_000 and payout is
 * `stake * oddsBps / 10_000`, mirroring the on-chain fixed-odds model (§13.5).
 */

import type { Outcome, Selection } from "@wc/shared-types";

export interface EnsureMarketParams {
  fixtureId: string;
  label: string;
  opensAt: number; // epoch ms
  closesAt: number; // epoch ms
}

export interface MarketRef {
  marketId: number;
  marketPda: string;
}

export interface PlaceBetParams {
  marketId: number;
  bettor: string; // wallet pubkey (mock: any stable id)
  selection: Selection;
  stakeWcdt: number;
  oddsBps: number;
}

export interface PlaceBetResult {
  signature: string;
  betPda: string;
}

export interface ResolveResult {
  signature: string;
}

export interface ClaimResult {
  signature: string;
  payoutWcdt: number;
}

export interface ChainGateway {
  readonly kind: "mock" | "solana";
  /** Idempotently open the market for a fixture. */
  ensureMarket(params: EnsureMarketParams): Promise<MarketRef>;
  /** Escrow the stake and record the bet (one per market per bettor). */
  placeBet(params: PlaceBetParams): Promise<PlaceBetResult>;
  /** Oracle-only: settle the market from the replayed final outcome. */
  resolveMarket(marketId: number, result: Outcome): Promise<ResolveResult>;
  /** Pay `stake * oddsBps / 1e4` if the bettor's selection won. */
  claimWinnings(marketId: number, bettor: string): Promise<ClaimResult>;
}

export const oddsToBps = (decimalOdds: number): number => Math.round(decimalOdds * 10_000);
export const payoutWcdt = (stakeWcdt: number, oddsBps: number): number =>
  Math.floor((stakeWcdt * oddsBps) / 10_000);
