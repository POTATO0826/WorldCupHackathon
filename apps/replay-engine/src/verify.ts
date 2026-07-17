/**
 * Phase 1 acceptance check (spec §24):
 *  - every fixture replays to its expected final score,
 *  - odds ticks do not create extra fixtures (one folder = one fixture),
 *  - duplicate score envelope ids are reported.
 *
 * Run: `npm run replay:verify`
 */
import { FIXTURES, FIXTURE_IDS, Outcome } from "@wc/shared-types";
import { ReplayEngine } from "./replayEngine.js";
import { outcomeFromScore } from "./matchState.js";
import { hasHistorical } from "./paths.js";

const outcomeLabel = (o: Outcome): string => Outcome[o];

async function main(): Promise<void> {
  const engine = new ReplayEngine();
  let failures = 0;

  const rows: string[] = [];
  rows.push(
    ["fixture", "teams", "final", "expected", "outcome", "scores", "dups", "odds", "hist", "ok"].join(
      "\t",
    ),
  );

  for (const id of FIXTURE_IDS) {
    const meta = FIXTURES[id]!;
    const stats = await engine.load(id);
    const state = engine.runToEnd();

    const gotHome = state.score.home;
    const gotAway = state.score.away;
    const ok =
      gotHome === meta.expectedFinalHome && gotAway === meta.expectedFinalAway;
    if (!ok) failures++;

    rows.push(
      [
        id,
        `${meta.homeTeam} v ${meta.awayTeam}`,
        `${gotHome}-${gotAway}`,
        `${meta.expectedFinalHome}-${meta.expectedFinalAway}`,
        outcomeLabel(outcomeFromScore(state.score)),
        String(stats.scoreFrames),
        String(stats.scoreDuplicates),
        String(stats.oddsFrames),
        hasHistorical(id) ? "yes" : "no",
        ok ? "✓" : "✗ MISMATCH",
      ].join("\t"),
    );
  }

  // Simple aligned print.
  const cols = rows.map((r) => r.split("\t"));
  const widths = cols[0]!.map((_, i) => Math.max(...cols.map((r) => (r[i] ?? "").length)));
  for (const r of cols) {
    console.log(r.map((c, i) => (c ?? "").padEnd(widths[i]!)).join("  "));
  }

  console.log("");
  if (failures === 0) {
    console.log(`PASS — all ${FIXTURE_IDS.length} fixtures replayed to expected final scores.`);
  } else {
    console.error(`FAIL — ${failures} fixture(s) mismatched.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
