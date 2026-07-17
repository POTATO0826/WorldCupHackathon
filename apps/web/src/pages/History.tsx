import { useStore } from "@/store";
import { Button } from "@/components/ui/button";
import { navigate } from "@/lib/router";
import type { RecommendationState } from "@/lib/types";

const STATE_STYLE: Record<RecommendationState, string> = {
  CREATED: "text-blue-mid",
  SENT: "text-blue-mid",
  AWAITING_CONFIRMATION: "text-blue",
  CONFIRMED: "text-blue",
  REJECTED: "text-blue-ink/40",
  EXPIRED: "text-blue-ink/40",
  TRANSACTION_PENDING: "text-blue",
  RECORDED_ON_CHAIN: "text-blue font-bold",
  WON: "text-blue font-bold",
  LOST: "text-blue-ink/60",
  VOID: "text-blue-ink/40",
  CLAIMED: "text-blue-deep font-bold",
};

export default function History() {
  const { recommendations } = useStore();

  return (
    <section className="mx-auto max-w-6xl px-4 pt-24 pb-20 sm:px-6">
      <p className="mb-2 font-mono text-[11px] tracking-[0.25em] text-blue uppercase">
        ● Live plans & bet history
      </p>
      <h1 className="font-serif text-4xl tracking-tight text-blue-ink">
        Every plan, <span className="italic text-blue">on the record.</span>
      </h1>

      <div className="mt-8 border border-hairline">
        <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border-b border-hairline bg-blue-faint px-5 py-2.5 font-mono text-[10.5px] tracking-[0.15em] text-blue-mid uppercase sm:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
          <span>Match / selection</span>
          <span className="hidden sm:block">Stake</span>
          <span className="hidden sm:block">Odds</span>
          <span>Result</span>
          <span>State</span>
        </div>
        {recommendations.length === 0 && (
          <p className="px-5 py-10 text-center font-mono text-[12px] text-blue-mid">
            No bet plans yet — open a live match and let the agent watch.
          </p>
        )}
        {recommendations.map((r) => (
          <div
            key={r.id}
            className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border-b border-hairline px-5 py-3.5 font-mono text-[12px] last:border-b-0 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr]"
          >
            <div className="min-w-0">
              <p className="truncate font-sans text-[13.5px] font-semibold text-blue-ink">
                {r.matchLabel}
              </p>
              <p className="text-[11px] text-blue-mid">
                {r.selection} @ {r.odds.toFixed(2)} · conf {r.confidence}%
                {r.txHash && ` · ${r.txHash.slice(0, 10)}…`}
              </p>
            </div>
            <span className="hidden text-blue-ink/80 sm:block">{r.stake}</span>
            <span className="hidden text-blue-ink/80 sm:block">{r.odds.toFixed(2)}</span>
            <span className="text-blue-ink/80">
              {r.finalScore ? `${r.finalScore.home}-${r.finalScore.away}` : "—"}
            </span>
            <span className={`text-[11px] ${STATE_STYLE[r.state]}`}>{r.state}</span>
          </div>
        ))}
      </div>

      <Button className="mt-6" variant="outline" onClick={() => navigate("/portfolio")}>
        ← Portfolio
      </Button>
    </section>
  );
}
