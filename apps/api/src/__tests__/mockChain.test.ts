import { describe, it, expect } from "vitest";
import { Outcome } from "@wc/shared-types";
import { MockChainGateway } from "../chain/mockChain.js";
import { oddsToBps, payoutWcdt } from "../chain/gateway.js";

const market = (g: MockChainGateway) =>
  g.ensureMarket({ fixtureId: "F1", label: "A v B", opensAt: 0, closesAt: 1 });

describe("MockChainGateway", () => {
  it("opens one market per fixture (idempotent)", async () => {
    const g = new MockChainGateway();
    const a = await market(g);
    const b = await market(g);
    expect(a.marketId).toBe(b.marketId);
  });

  it("records a bet and pays a winner on claim", async () => {
    const g = new MockChainGateway();
    const { marketId } = await market(g);
    await g.placeBet({ marketId, bettor: "W", selection: "Home", stakeWcdt: 20, oddsBps: oddsToBps(1.75) });
    await g.resolveMarket(marketId, Outcome.Home);
    const claim = await g.claimWinnings(marketId, "W");
    expect(claim.payoutWcdt).toBe(payoutWcdt(20, oddsToBps(1.75))); // 35
    expect(claim.signature).toMatch(/^mock_claim_/);
  });

  it("pays a loser nothing", async () => {
    const g = new MockChainGateway();
    const { marketId } = await market(g);
    await g.placeBet({ marketId, bettor: "W", selection: "Away", stakeWcdt: 20, oddsBps: oddsToBps(3) });
    await g.resolveMarket(marketId, Outcome.Home);
    expect((await g.claimWinnings(marketId, "W")).payoutWcdt).toBe(0);
  });

  it("enforces one bet per market per bettor", async () => {
    const g = new MockChainGateway();
    const { marketId } = await market(g);
    await g.placeBet({ marketId, bettor: "W", selection: "Home", stakeWcdt: 10, oddsBps: 20000 });
    await expect(
      g.placeBet({ marketId, bettor: "W", selection: "Draw", stakeWcdt: 10, oddsBps: 20000 }),
    ).rejects.toThrow(/already exists/);
  });

  it("rejects placing after resolve and double resolve", async () => {
    const g = new MockChainGateway();
    const { marketId } = await market(g);
    await g.resolveMarket(marketId, Outcome.Home);
    await expect(
      g.placeBet({ marketId, bettor: "W", selection: "Home", stakeWcdt: 10, oddsBps: 20000 }),
    ).rejects.toThrow(/already resolved/);
    await expect(g.resolveMarket(marketId, Outcome.Away)).rejects.toThrow(/already resolved/);
  });

  it("rejects sub-1.0 odds and non-positive stake", async () => {
    const g = new MockChainGateway();
    const { marketId } = await market(g);
    await expect(
      g.placeBet({ marketId, bettor: "W", selection: "Home", stakeWcdt: 10, oddsBps: 9999 }),
    ).rejects.toThrow(/odds/);
    await expect(
      g.placeBet({ marketId, bettor: "W", selection: "Home", stakeWcdt: 0, oddsBps: 20000 }),
    ).rejects.toThrow(/stake/);
  });
});
