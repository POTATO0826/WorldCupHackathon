import { EventEmitter } from "node:events";
import {
  type MatchState,
  type MergedTick,
  type ReplaySpeed,
  type ScoreFrameData,
  type OddsFrameData,
} from "@wc/shared-types";
import { readScoreFrames, readOddsFrames } from "./parser.js";
import { dedupeScoreFrames } from "./dedupe.js";
import { buildMergedTimeline } from "./merge.js";
import { createInitialState, applyScoreFrame, applyOddsFrame } from "./matchState.js";
import { scoresPath, oddsPath } from "./paths.js";

export type ReplayStatus = "IDLE" | "RUNNING" | "PAUSED" | "COMPLETED";

export interface LoadStats {
  fixtureId: string;
  scoreFrames: number;
  scoreDuplicates: number;
  oddsFrames: number;
  timelineTicks: number;
}

/**
 * Clocked replay of a single fixture — spec §10. Emits `tick`, `score`, `odds`,
 * and `completed` events. Provides both a real-time clocked run (start/pause/
 * resume/restart/setSpeed) and a synchronous `runToEnd()` used by tests and the
 * settle-verification CLI.
 */
export class ReplayEngine extends EventEmitter {
  private timeline: MergedTick[] = [];
  private cursor = 0;
  private speed: ReplaySpeed = 1;
  private timer: NodeJS.Timeout | null = null;
  private t0 = 0; // first tick Ts
  private wallStart = 0;
  private pausedAt = 0;
  private pauseOffset = 0;

  status: ReplayStatus = "IDLE";
  state: MatchState = createInitialState("");
  loadStats: LoadStats | null = null;

  /** Parse + dedupe + merge a fixture's feed into a replayable timeline. */
  async load(fixtureId: string): Promise<LoadStats> {
    this.stop();
    const [scoreEnvelopes, oddsEnvelopes] = await Promise.all([
      readScoreFrames(scoresPath(fixtureId)),
      readOddsFrames(oddsPath(fixtureId)),
    ]);
    const { frames: dedupedScores, duplicates } = dedupeScoreFrames(scoreEnvelopes);
    const scoreData = dedupedScores.map((e) => e.data);
    const oddsData = oddsEnvelopes.map((e) => e.data);

    this.timeline = buildMergedTimeline(fixtureId, scoreData, oddsData);
    this.cursor = 0;
    this.state = createInitialState(fixtureId);
    this.t0 = this.timeline[0]?.ts ?? 0;
    this.status = "IDLE";

    this.loadStats = {
      fixtureId,
      scoreFrames: dedupedScores.length,
      scoreDuplicates: duplicates,
      oddsFrames: oddsData.length,
      timelineTicks: this.timeline.length,
    };
    return this.loadStats;
  }

  private applyTick(tick: MergedTick): void {
    if (tick.kind === "score") {
      applyScoreFrame(this.state, tick.payload as ScoreFrameData);
      this.emit("score", this.state);
    } else {
      applyOddsFrame(this.state, tick.payload as OddsFrameData);
      this.emit("odds", this.state);
    }
    this.emit("tick", this.state, tick);
  }

  /** Apply every remaining tick synchronously and return the terminal state. */
  runToEnd(): MatchState {
    while (this.cursor < this.timeline.length) {
      this.applyTick(this.timeline[this.cursor]!);
      this.cursor++;
    }
    this.status = "COMPLETED";
    this.emit("completed", this.state);
    return this.state;
  }

  // ---- Clocked controls (spec §9.9) --------------------------------------

  private virtualNow(): number {
    return this.t0 + (Date.now() - this.wallStart) * this.speed - this.pauseOffset;
  }

  start(): void {
    if (this.status === "RUNNING") return;
    if (this.status === "IDLE" || this.status === "COMPLETED") {
      this.wallStart = Date.now();
      this.pauseOffset = 0;
    }
    this.status = "RUNNING";
    this.timer = setInterval(() => this.drain(), 50);
  }

  private drain(): void {
    const now = this.virtualNow();
    while (this.cursor < this.timeline.length && this.timeline[this.cursor]!.ts <= now) {
      this.applyTick(this.timeline[this.cursor]!);
      this.cursor++;
    }
    if (this.cursor >= this.timeline.length) {
      this.status = "COMPLETED";
      this.clearTimer();
      this.emit("completed", this.state);
    }
  }

  pause(): void {
    if (this.status !== "RUNNING") return;
    this.status = "PAUSED";
    this.pausedAt = Date.now();
    this.clearTimer();
  }

  resume(): void {
    if (this.status !== "PAUSED") return;
    this.pauseOffset += (Date.now() - this.pausedAt) * this.speed;
    this.status = "RUNNING";
    this.timer = setInterval(() => this.drain(), 50);
  }

  restart(): void {
    this.clearTimer();
    this.cursor = 0;
    this.state = createInitialState(this.state.fixtureId);
    this.pauseOffset = 0;
    this.status = "IDLE";
  }

  setSpeed(speed: ReplaySpeed): void {
    // Preserve the current virtual position when changing speed. Both the
    // RUNNING and PAUSED cases rebaseline the clock so already-elapsed real
    // time is not retroactively re-scaled by the new speed on the next drain.
    if (this.status === "RUNNING") {
      const vNow = this.virtualNow();
      this.speed = speed;
      this.wallStart = Date.now();
      this.pauseOffset = this.t0 - vNow;
    } else if (this.status === "PAUSED") {
      // Anchor to pausedAt (the frozen instant) rather than Date.now(), so the
      // virtual clock stays put through the pause and resume() applies the new
      // speed only to time elapsed after resuming.
      const vNowAtPause =
        this.t0 + (this.pausedAt - this.wallStart) * this.speed - this.pauseOffset;
      this.speed = speed;
      this.wallStart = this.pausedAt;
      this.pauseOffset = this.t0 - vNowAtPause;
    } else {
      this.speed = speed;
    }
  }

  private clearTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  stop(): void {
    this.clearTimer();
    this.status = "IDLE";
  }
}
