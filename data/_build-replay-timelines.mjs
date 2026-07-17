import fs from "fs";
import path from "path";

const base = "C:/WorldCupHackathon/data/exact-match-txline-raw-inspect/txline-raw";
const outDir = "C:/WorldCupHackathon/apps/web/public/replay";
fs.mkdirSync(outDir, { recursive: true });

// Simulated display labels — only FRA-MAR is documented in the archive README.
const TEAMS = {
  1999: { name: "France", code: "FRA" },
  2530: { name: "Morocco", code: "MAR" },
  2661: { name: "Argentina", code: "ARG" },
  1888: { name: "England", code: "ENG" },
  3021: { name: "Brazil", code: "BRA" },
  1575: { name: "Spain", code: "ESP" },
  1489: { name: "Germany", code: "GER" },
  3099: { name: "Portugal", code: "POR" },
};

const FIXTURES = ["18209181", "18213979", "18218149", "18222446", "18237038", "18241006"];

const KEEP_ACTIONS = new Set([
  "kickoff",
  "goal",
  "shot",
  "corner",
  "yellow_card",
  "red_card",
  "penalty",
  "penalty_outcome",
  "var",
  "var_end",
  "danger_possession",
  "high_danger_possession",
  "substitution",
  "additional_time",
  "status",
  "halftime_finalised",
  "game_finalised",
  "score_adjustment",
  "action_discarded",
  "injury",
]);

function* readNdjson(file) {
  const fd = fs.openSync(file, "r");
  const buf = Buffer.alloc(1024 * 512);
  let leftover = "";
  let pos = 0;
  const size = fs.fstatSync(fd).size;
  while (pos < size) {
    const n = fs.readSync(fd, buf, 0, buf.length, pos);
    if (n <= 0) break;
    pos += n;
    leftover += buf.toString("utf8", 0, n);
    let idx;
    while ((idx = leftover.indexOf("\n")) >= 0) {
      const line = leftover.slice(0, idx).trim();
      leftover = leftover.slice(idx + 1);
      if (line) yield line;
    }
  }
  if (leftover.trim()) yield leftover.trim();
  fs.closeSync(fd);
}

const catalogue = [];

for (const id of FIXTURES) {
  const scoreFile = path.join(base, id, "scores.ndjson");
  const oddsFile = path.join(base, id, "odds.ndjson");

  // ---- scores ----
  const seen = new Set();
  const rawEvents = [];
  let meta = null;
  for (const line of readNdjson(scoreFile)) {
    const row = JSON.parse(line);
    if (seen.has(row.id)) continue; // dedupe duplicate SSE envelope ids
    seen.add(row.id);
    const d = row.data;
    if (!meta && d.Participant1Id) {
      meta = {
        homeId: d.Participant1IsHome ? d.Participant1Id : d.Participant2Id,
        awayId: d.Participant1IsHome ? d.Participant2Id : d.Participant1Id,
        startTime: d.StartTime,
      };
    }
    rawEvents.push(d);
  }
  rawEvents.sort((x, y) => x.Ts - y.Ts || (x.Seq ?? 0) - (y.Seq ?? 0));

  const t0 = rawEvents[0].Ts;
  const events = [];
  let lastScore = { h: 0, a: 0 };
  for (const d of rawEvents) {
    const h = d.Stats?.["1"];
    const a = d.Stats?.["2"];
    if (typeof h === "number") lastScore = { h, a: a ?? lastScore.a };
    if (!KEEP_ACTIONS.has(d.Action)) continue;
    events.push({
      t: Math.round((d.Ts - t0) / 1000), // seconds since first frame
      clock: d.Clock?.Seconds ?? null,
      run: d.Clock?.Running ?? false,
      status: d.StatusId ?? null,
      action: d.Action,
      p: d.Participant ?? null,
      conf: d.Confirmed ?? null,
      h: lastScore.h,
      a: lastScore.a,
    });
  }

  // ---- odds: match-level 1X2 only, change-only, min 15s spacing ----
  const odds = [];
  let lastOdds = null;
  let lastKeptTs = -Infinity;
  for (const line of readNdjson(oddsFile)) {
    const row = JSON.parse(line);
    const d = row.data;
    if (d.SuperOddsType !== "1X2_PARTICIPANT_RESULT") continue;
    if (d.MarketPeriod != null && d.MarketPeriod !== "") continue;
    const [ph, pd, pa] = d.Prices;
    // TxLINE sends null prices while the market is suspended — skip those ticks
    if (ph == null || pd == null || pa == null) continue;
    const key = `${ph}:${pd}:${pa}`;
    const ts = Math.round((d.Ts - t0) / 1000);
    if (key === lastOdds && ts - lastKeptTs < 60) continue;
    if (key !== lastOdds || ts - lastKeptTs >= 15) {
      odds.push({
        t: ts,
        h: ph / 1000,
        d: pd / 1000,
        a: pa / 1000,
        live: d.InRunning === true,
      });
      lastOdds = key;
      lastKeptTs = ts;
    }
  }

  const home = TEAMS[meta.homeId] ?? { name: `Team ${meta.homeId}`, code: `T${meta.homeId}` };
  const away = TEAMS[meta.awayId] ?? { name: `Team ${meta.awayId}`, code: `T${meta.awayId}` };
  const last = events[events.length - 1];
  const timeline = {
    fixtureId: id,
    home: { id: meta.homeId, ...home },
    away: { id: meta.awayId, ...away },
    startTime: meta.startTime,
    t0,
    durationSec: last.t,
    finalScore: { home: lastScore.h, away: lastScore.a },
    events,
    odds,
  };
  fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(timeline));

  catalogue.push({
    fixtureId: id,
    home: timeline.home,
    away: timeline.away,
    startTime: meta.startTime,
    durationSec: last.t,
    finalScore: timeline.finalScore,
    events: events.length,
    oddsTicks: odds.length,
  });
  console.log(
    `${id}: ${home.code} v ${away.code} final ${lastScore.h}-${lastScore.a}, ${events.length} events, ${odds.length} odds ticks`,
  );
}

fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify(catalogue, null, 2));
console.log("Wrote catalogue with", catalogue.length, "fixtures ->", outDir);
