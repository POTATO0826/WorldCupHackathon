import { motion } from "framer-motion";
import DitherArt from "@/components/DitherArt";
import { coinPainter } from "@/lib/painters";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store";
import { navigate } from "@/lib/router";
import { fmtSol } from "@/lib/utils";

export default function Portfolio() {
  const { balance, recommendations, claimWinnings } = useStore();

  const settled = recommendations.filter((r) => ["WON", "LOST", "CLAIMED"].includes(r.state));
  const active = recommendations.filter((r) => r.state === "RECORDED_ON_CHAIN");
  const staked = recommendations
    .filter((r) => ["RECORDED_ON_CHAIN", "WON", "LOST", "CLAIMED"].includes(r.state))
    .reduce((s, r) => s + r.stake, 0);
  const returned = settled.reduce((s, r) => s + (r.settledPayout ?? 0), 0);
  const wins = settled.filter((r) => r.state === "WON" || r.state === "CLAIMED").length;
  const winRate = settled.length ? Math.round((wins / settled.length) * 100) : null;
  const pnl = returned - settled.reduce((s, r) => s + r.stake, 0);
  const claimable = recommendations.filter((r) => r.state === "WON");

  const stats: Array<[string, string]> = [
    ["SOL balance", fmtSol(balance)],
    ["Total staked", fmtSol(staked)],
    ["Total returned", fmtSol(returned)],
    ["Profit / loss", `${pnl >= 0 ? "+" : ""}${fmtSol(pnl)}`],
    ["Win rate", winRate == null ? "—" : `${winRate}%`],
    ["Active bets", String(active.length)],
  ];

  return (
    <section className="mx-auto max-w-6xl px-4 pt-24 pb-20 sm:px-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="mb-2 font-mono text-[11px] tracking-[0.25em] text-blue uppercase">
            ● Virtual portfolio
          </p>
          <h1 className="font-serif text-4xl tracking-tight text-blue-ink">
            Your <span className="italic text-blue">SOL.</span>
          </h1>
        </div>
        <div className="hidden h-24 w-24 sm:block">
          <DitherArt painter={coinPainter("◎")} pixelSize={2} timeScale={0.6} />
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-px border border-hairline bg-hairline md:grid-cols-3">
        {stats.map(([k, v], i) => (
          <motion.div
            key={k}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.05 }}
            className="bg-paper p-5"
          >
            <p className="font-mono text-[10.5px] tracking-[0.2em] text-blue-mid uppercase">{k}</p>
            <p className="mt-1.5 font-serif text-2xl text-blue-ink">{v}</p>
          </motion.div>
        ))}
      </div>

      {claimable.length > 0 && (
        <div className="mt-6 border border-blue bg-blue-wash p-5">
          <p className="font-serif text-xl text-blue-ink">
            <span className="italic text-blue">{claimable.length} winning bet(s)</span> ready to claim.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {claimable.map((r) => (
              <Button key={r.id} size="sm" onClick={() => claimWinnings(r.id)}>
                Claim {r.settledPayout} SOL — {r.matchLabel}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <Button variant="outline" onClick={() => navigate("/history")}>
          Full betting history →
        </Button>
        <Button variant="ghost" onClick={() => navigate("/matches")}>
          Back to matches
        </Button>
      </div>

      <p className="mt-8 border border-hairline bg-blue-faint px-4 py-3 font-mono text-[11px] text-blue-mid">
        Live stakes in SOL on Solana. Claim winnings after the agent’s market settles.
      </p>
    </section>
  );
}
