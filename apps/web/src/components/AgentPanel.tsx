import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store";
import { navigate } from "@/lib/router";
import type { Recommendation } from "@/lib/types";

function ConfidenceBlocks({ value }: { value: number }) {
  const blocks = 10;
  const filled = Math.round((value / 100) * blocks);
  return (
    <span className="flex gap-0.5">
      {Array.from({ length: blocks }).map((_, i) => (
        <span
          key={i}
          className={`h-3 w-2 ${i < filled ? "bg-blue" : "bg-blue-wash"}`}
        />
      ))}
    </span>
  );
}

function RecCard({ rec }: { rec: Recommendation }) {
  const { rejectRecommendation, changeStake } = useStore();
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="border border-blue bg-white"
    >
      <div className="flex items-center justify-between border-b border-hairline bg-blue-faint px-4 py-2">
        <span className="font-mono text-[10.5px] tracking-[0.2em] text-blue uppercase">
          Live bet plan
        </span>
        <span className="font-mono text-[10.5px] text-blue-mid">#{rec.id}</span>
      </div>
      <div className="px-4 py-3">
        <p className="font-serif text-2xl text-blue-ink">
          <span className="italic text-blue">{rec.selection}</span>{" "}
          {rec.selection !== "Draw" ? "Win" : ""}
          <span className="ml-2 font-mono text-sm text-blue-mid">@ {rec.odds.toFixed(2)}</span>
        </p>
        <div className="mt-2 flex items-center gap-3">
          <ConfidenceBlocks value={rec.confidence} />
          <span className="font-mono text-[12px] font-bold text-blue">{rec.confidence}%</span>
        </div>
        <p className="mt-3 border-l-2 border-blue-soft pl-3 text-[12.5px] leading-relaxed text-blue-ink/75">
          {rec.reason}
        </p>
        <div className="mt-3 grid grid-cols-3 gap-px border border-hairline bg-hairline font-mono text-[11px]">
          <div className="bg-paper p-2">
            <p className="text-blue-mid">STAKE</p>
            <p className="mt-0.5 font-bold text-blue-ink">{rec.stake} SOL</p>
          </div>
          <div className="bg-paper p-2">
            <p className="text-blue-mid">ODDS</p>
            <p className="mt-0.5 font-bold text-blue-ink">{rec.odds.toFixed(2)}</p>
          </div>
          <div className="bg-paper p-2">
            <p className="text-blue-mid">PAYOUT</p>
            <p className="mt-0.5 font-bold text-blue">{rec.payout} SOL</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => navigate(`/confirm/${rec.id}`)}>
            Confirm plan
          </Button>
          <Button size="sm" variant="outline" onClick={() => rejectRecommendation(rec.id)}>
            Reject
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const v = window.prompt("New stake (SOL):", String(rec.stake));
              if (v) changeStake(rec.id, Number(v) || rec.stake);
            }}
          >
            Change Stake
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

/** The agent's live brain: current decision, SKIP feed, open recommendation. */
export default function AgentPanel({ fixtureId }: { fixtureId: string }) {
  const { lastDecision, skips, recommendations, prefs } = useStore();

  const open = recommendations.find(
    (r) => r.fixtureId === fixtureId && r.state === "AWAITING_CONFIRMATION",
  );
  const recent = [...skips].reverse().slice(0, 4);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] tracking-[0.2em] text-blue uppercase">
          PressureEdge V1 · {prefs.mode}
        </span>
        <motion.span
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.6, repeat: Infinity }}
          className="flex items-center gap-1.5 font-mono text-[10.5px] text-blue"
        >
          <span className="h-1.5 w-1.5 bg-blue" /> watching
        </motion.span>
      </div>

      {open ? (
        <RecCard rec={open} />
      ) : lastDecision?.type === "BET" ? (
        <p className="border border-hairline bg-blue-faint px-4 py-3 font-mono text-[11.5px] text-blue">
          Edge found — drafting your bet plan…
        </p>
      ) : (
        <div className="border border-hairline px-4 py-3">
          <p className="font-serif text-xl text-blue-ink">
            <span className="italic text-blue">Watching.</span> No plan yet.
          </p>
          <p className="mt-1 font-mono text-[11px] leading-relaxed text-blue-ink/60">
            {lastDecision?.skipReason ??
              "The agent reads live score, pressure and odds — then proposes a plan for you to confirm."}
          </p>
        </div>
      )}

      {lastDecision && Object.keys(lastDecision.features).length > 0 && (
        <div className="grid grid-cols-2 gap-px border border-hairline bg-hairline font-mono text-[10.5px]">
          {Object.entries(lastDecision.features).map(([k, v]) => (
            <div key={k} className="flex justify-between bg-paper px-2.5 py-1.5">
              <span className="text-blue-mid uppercase">{k}</span>
              <span className="font-bold text-blue-ink">{String(v)}</span>
            </div>
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <div>
          <p className="mb-1.5 font-mono text-[10px] tracking-[0.2em] text-blue-mid uppercase">
            Recent skips
          </p>
          <ul className="space-y-1">
            {recent.map((s) => (
              <li
                key={s.at}
                className="truncate border-l-2 border-blue-wash pl-2 font-mono text-[10.5px] text-blue-ink/55"
              >
                {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
