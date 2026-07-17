import { describe, it, expect } from "vitest";
import { Outcome } from "@wc/shared-types";
import { dedupeScoreFrames } from "../dedupe.js";
import { buildMergedTimeline } from "../merge.js";
import { outcomeFromScore } from "../matchState.js";
import { ReplayEngine } from "../replayEngine.js";

describe("dedupeScoreFrames", () => {
  it("keeps first-seen and counts duplicates (§9.7)", () => {
    const frames = [
      { id: "a", data: { FixtureId: 1, Action: "x", Ts: 1 } },
      { id: "a", data: { FixtureId: 1, Action: "x", Ts: 1 } },
      { id: "b", data: { FixtureId: 1, Action: "y", Ts: 2 } },
    ] as any;
    const { frames: out, duplicates } = dedupeScoreFrames(frames);
    expect(out.map((f) => f.id)).toEqual(["a", "b"]);
    expect(duplicates).toBe(1);
  });
});

describe("buildMergedTimeline", () => {
  it("sorts by Ts and applies score before odds on ties (§9.8)", () => {
    const scores = [{ FixtureId: 1, Action: "goal", Ts: 10 }] as any;
    const odds = [{ FixtureId: 1, SuperOddsType: "1X2_PARTICIPANT_RESULT", Ts: 10 }] as any;
    const ticks = buildMergedTimeline("1", scores, odds);
    expect(ticks.map((t) => t.kind)).toEqual(["score", "odds"]);
  });
});

describe("outcomeFromScore", () => {
  it("maps score to 1X2 outcome (§14)", () => {
    expect(outcomeFromScore({ home: 2, away: 0 })).toBe(Outcome.Home);
    expect(outcomeFromScore({ home: 1, away: 1 })).toBe(Outcome.Draw);
    expect(outcomeFromScore({ home: 0, away: 2 })).toBe(Outcome.Away);
  });
});

describe("ReplayEngine golden replay", () => {
  it("replays FRA-MAR (18209181) to 2-0 and strips 413 duplicate ids", async () => {
    const engine = new ReplayEngine();
    const stats = await engine.load("18209181");
    expect(stats.scoreDuplicates).toBe(413);
    const state = engine.runToEnd();
    expect(state.score).toEqual({ home: 2, away: 0 });
    expect(outcomeFromScore(state.score)).toBe(Outcome.Home);
  }, 30000);
});
