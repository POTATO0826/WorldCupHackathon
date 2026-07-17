import { Button } from "@/components/ui/button";
import { useStore } from "@/store";
import type { ReplaySpeed } from "@/lib/types";

const SPEEDS: ReplaySpeed[] = [1, 10, 30, 60];

const STATUS_LABEL: Record<string, string> = {
  idle: "connecting",
  running: "live",
  paused: "paused",
  finished: "full time",
};

export default function ReplayControls() {
  const { replay, startReplay, pauseReplay, resumeReplay, restartReplay, setSpeed } = useStore();
  const { status, speed } = replay;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "idle" || status === "finished" ? (
        <Button size="sm" onClick={startReplay} disabled={!replay.timeline}>
          ▶ Go live
        </Button>
      ) : status === "running" ? (
        <Button size="sm" variant="outline" onClick={pauseReplay}>
          ⏸ Pause
        </Button>
      ) : (
        <Button size="sm" onClick={resumeReplay}>
          ▶ Resume
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={restartReplay} disabled={!replay.timeline}>
        ↺ Restart
      </Button>
      <span className="mx-1 h-5 w-px bg-hairline" />
      <span className="font-mono text-[10px] tracking-[0.15em] text-blue-mid uppercase">
        feed
      </span>
      {SPEEDS.map((s) => (
        <button
          key={s}
          onClick={() => setSpeed(s)}
          className={`cursor-pointer border px-2.5 py-1 font-mono text-[11px] transition-colors ${
            speed === s
              ? "border-blue bg-blue text-white"
              : "border-blue/30 text-blue hover:bg-blue-wash"
          }`}
        >
          {s}x
        </button>
      ))}
      <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px] tracking-[0.15em] text-blue uppercase">
        {status === "running" && <span className="h-1.5 w-1.5 animate-pulse bg-blue" />}
        {STATUS_LABEL[status] ?? status}
      </span>
    </div>
  );
}
