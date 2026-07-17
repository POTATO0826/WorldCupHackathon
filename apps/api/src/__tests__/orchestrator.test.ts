/**
 * End-to-end orchestrator flow against real fixtures + the mock chain:
 * replay -> agent recommendation -> confirm -> on-chain bet -> oracle resolve
 * -> settlement -> claim (spec §28 lifecycle, §14 oracle).
 */
import { describe, it, expect } from "vitest";
import { Outcome } from "@wc/shared-types";
import { SimulationEngine } from "../orchestrator/simulationEngine.js";
import { MockChainGateway } from "../chain/mockChain.js";

describe("SimulationEngine lifecycle", () => {
  it("drives a fixture to a recommendation, records the bet, and settles it", async () => {
    const chain = new MockChainGateway();
    const engine = new SimulationEngine({ chain, startingBalance: 1000 });

    await engine.stepToNextRecommendationOrEnd("18209181");
    const recs = engine.getRecommendations();
    expect(recs.length).toBeGreaterThan(0);
    const rec = recs[0]!;
    expect(rec.state).toBe("AWAITING_CONFIRMATION");
    expect(rec.marketId).not.toBeNull();

    const balBefore = engine.getPortfolio().balance;
    await engine.confirmRecommendation(rec.id);

    const recorded = engine.getRecommendation(rec.id)!;
    expect(recorded.state).toBe("RECORDED_ON_CHAIN");
    expect(recorded.txSignature).toMatch(/^mock_bet_/);

    const mid = engine.getPortfolio();
    expect(mid.balance).toBe(balBefore - recorded.stake);
    expect(mid.staked).toBe(recorded.stake);
    expect(mid.bets).toHaveLength(1);
    expect(mid.bets[0]!.state).toBe("RECORDED_ON_CHAIN");

    // Run to the terminal state -> oracle resolve + settlement.
    await engine.stepToNextRecommendationOrEnd("18209181", false);

    const settled = engine.getRecommendation(rec.id)!;
    expect(["WON", "LOST"]).toContain(settled.state);
    expect(chain.marketResult(recorded.marketId)).toBe(Outcome.Home); // 18209181 = 2-0

    const port = engine.getPortfolio();
    expect(port.staked).toBe(0); // no longer at risk once settled
    if (settled.state === "LOST") {
      expect(port.dailyLoss).toBe(recorded.stake);
      expect(port.realisedPnl).toBe(-recorded.stake);
      expect(port.balance).toBe(balBefore - recorded.stake);
    }
  }, 30000);

  it("settles a winning bet and pays out on claim", async () => {
    const chain = new MockChainGateway();
    const engine = new SimulationEngine({ chain, startingBalance: 1000 });

    // 18218149 ends 2-1 (Home); its first recommendation backs Home -> a winner.
    await engine.stepToNextRecommendationOrEnd("18218149");
    const rec = engine.getRecommendations()[0]!;
    expect(rec.selection).toBe("Home");

    await engine.confirmRecommendation(rec.id);
    await engine.stepToNextRecommendationOrEnd("18218149", false);

    const won = engine.getRecommendation(rec.id)!;
    expect(won.state).toBe("WON");

    const balBefore = engine.getPortfolio().balance;
    const claimed = await engine.claimWinnings(rec.id);
    expect(claimed.state).toBe("CLAIMED");
    expect(claimed.payout).toBeGreaterThan(rec.stake); // odds > 1

    const port = engine.getPortfolio();
    expect(port.balance).toBe(balBefore + claimed.payout!);
    expect(port.realisedPnl).toBe(claimed.payout! - rec.stake);
    expect(port.bets[0]!.state).toBe("CLAIMED");
  }, 30000);

  it("rejecting a recommendation frees the fixture to recommend again", async () => {
    const engine = new SimulationEngine({ chain: new MockChainGateway() });
    await engine.stepToNextRecommendationOrEnd("18213979");
    const rec = engine.getRecommendations()[0]!;
    const out = engine.rejectRecommendation(rec.id);
    expect(out.state).toBe("REJECTED");
    // Cannot confirm a rejected recommendation.
    await expect(engine.confirmRecommendation(rec.id)).rejects.toThrow();
  }, 30000);

  it("streams domain events to subscribers", async () => {
    const engine = new SimulationEngine({ chain: new MockChainGateway() });
    const types = new Set<string>();
    engine.onEvent((e) => types.add(e.type));
    await engine.stepToNextRecommendationOrEnd("18209181");
    expect(types.has("state")).toBe(true);
    expect(types.has("recommendation")).toBe(true);
  }, 30000);
});
