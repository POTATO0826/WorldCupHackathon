import type { MatchState, OddsTick, ReplaySpeed, Timeline, TimelineEvent } from "@/lib/types";

export type ReplayStatus = "idle" | "running" | "paused" | "finished";

export interface ReplaySnapshot {
  status: ReplayStatus;
  speed: ReplaySpeed;
  /** seconds into the capture timeline */
  cursor: number;
  state: MatchState | null;
  timeline: Timeline | null;
}

type Listener = (snap: ReplaySnapshot) => void;

/**
 * Client-side replay engine: walks a pre-materialised fixture timeline
 * (built from the TxLINE capture) on a virtual clock with speed control.
 */
export class ReplayEngine {
  private timeline: Timeline | null = null;
  private status: ReplayStatus = "idle";
  private speed: ReplaySpeed = 30;
  private cursor = 0;
  private evIdx = 0;
  private oddsIdx = 0;
  private raf = 0;
  private lastTick = 0;
  private listeners = new Set<Listener>();
  private state: MatchState | null = null;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  private emit() {
    const snap = this.snapshot();
    for (const fn of this.listeners) fn(snap);
  }

  snapshot(): ReplaySnapshot {
    return {
      status: this.status,
      speed: this.speed,
      cursor: this.cursor,
      state: this.state,
      timeline: this.timeline,
    };
  }

  async load(fixtureId: string): Promise<void> {
    this.stopLoop();
    const res = await fetch(`/replay/${fixtureId}.json`);
    this.timeline = (await res.json()) as Timeline;
    this.reset();
    this.emit();
  }

  private reset() {
    this.cursor = 0;
    this.evIdx = 0;
    this.oddsIdx = 0;
    this.status = "idle";
    if (this.timeline) {
      this.state = {
        fixtureId: this.timeline.fixtureId,
        score: { home: 0, away: 0 },
        clock: 0,
        running: false,
        status: 1,
        odds: null,
        recent: [],
        varActive: false,
        unconfirmedGoal: false,
        finished: false,
      };
    }
  }

  start() {
    if (!this.timeline) return;
    // only rewind when the match is over — keep mid-match seeks intact
    if (this.status === "finished") this.reset();
    this.status = "running";
    this.lastTick = performance.now();
    this.loop();
    this.emit();
  }

  /**
   * Jump to a match-clock moment (seconds) so Live Desk can open mid-game.
   * Leaves status paused — caller should start/resume afterward.
   */
  seekToClock(clockSec: number) {
    if (!this.timeline || !this.state) return;
    this.stopLoop();
    this.reset();

    const evs = this.timeline.events;
    let targetT = this.timeline.durationSec * 0.42;
    for (const ev of evs) {
      if (ev.clock != null && ev.clock >= clockSec) {
        targetT = ev.t;
        break;
      }
    }

    this.cursor = targetT;
    while (this.evIdx < evs.length && evs[this.evIdx]!.t <= this.cursor) {
      this.applyEvent(evs[this.evIdx]!);
      this.evIdx++;
    }
    const ods = this.timeline.odds;
    while (this.oddsIdx < ods.length && ods[this.oddsIdx]!.t <= this.cursor) {
      this.state.odds = ods[this.oddsIdx]!;
      this.oddsIdx++;
    }

    this.status = "paused";
    this.emit();
  }

  pause() {
    if (this.status !== "running") return;
    this.status = "paused";
    this.stopLoop();
    this.emit();
  }

  resume() {
    if (this.status !== "paused") return;
    this.status = "running";
    this.lastTick = performance.now();
    this.loop();
    this.emit();
  }

  restart() {
    if (!this.timeline) return;
    this.stopLoop();
    this.reset();
    this.status = "running";
    this.lastTick = performance.now();
    this.loop();
    this.emit();
  }

  setSpeed(speed: ReplaySpeed) {
    this.speed = speed;
    this.emit();
  }

  private stopLoop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private loop = () => {
    if (this.status !== "running" || !this.timeline || !this.state) return;
    const now = performance.now();
    const dt = ((now - this.lastTick) / 1000) * this.speed;
    this.lastTick = now;
    this.cursor = Math.min(this.cursor + dt, this.timeline.durationSec);

    let changed = false;
    const evs = this.timeline.events;
    while (this.evIdx < evs.length && evs[this.evIdx]!.t <= this.cursor) {
      this.applyEvent(evs[this.evIdx]!);
      this.evIdx++;
      changed = true;
    }
    const ods = this.timeline.odds;
    while (this.oddsIdx < ods.length && ods[this.oddsIdx]!.t <= this.cursor) {
      this.state.odds = ods[this.oddsIdx]!;
      this.oddsIdx++;
      changed = true;
    }

    if (this.cursor >= this.timeline.durationSec) {
      this.status = "finished";
      this.state.finished = true;
      this.state.running = false;
      // trust the materialised final score
      this.state.score = { ...this.timeline.finalScore };
      changed = true;
    }

    if (changed || true) this.emit();
    if (this.status === "running") this.raf = requestAnimationFrame(this.loop);
  };

  private applyEvent(ev: TimelineEvent) {
    const st = this.state!;
    st.clock = ev.clock ?? st.clock;
    st.running = ev.run;
    if (ev.status != null) st.status = ev.status;
    st.score = { home: ev.h, away: ev.a };
    st.recent = [...st.recent.slice(-11), ev];
    if (ev.action === "var") st.varActive = true;
    if (ev.action === "var_end") st.varActive = false;
    if (ev.action === "goal") st.unconfirmedGoal = ev.conf === false;
    if (ev.action === "game_finalised") st.finished = true;
  }
}

export const PHASE_LABEL: Record<number, string> = {
  1: "PRE-MATCH",
  2: "1ST HALF",
  3: "HALF TIME",
  4: "2ND HALF",
  5: "FULL TIME",
  6: "ET BREAK",
  7: "ET 1ST",
  8: "ET BREAK",
  9: "ET 2ND",
  10: "ET END",
  100: "FINALISED",
};

export function phaseLabel(status: number | null): string {
  if (status == null) return "LIVE";
  return PHASE_LABEL[status] ?? "LIVE";
}

export function currentOdds(state: MatchState | null): OddsTick | null {
  return state?.odds ?? null;
}
