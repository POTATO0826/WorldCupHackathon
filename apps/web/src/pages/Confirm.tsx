import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store";
import { navigate } from "@/lib/router";
import { fmtSol } from "@/lib/utils";

/** Final confirmation screen — mirrors the SafeSend "override warning" modal:
 * type-to-confirm, then MetaMask signature. */
export default function Confirm({ recId }: { recId: string }) {
  const { recommendations, confirmBet, balance, prefs, dailyLoss, address, connectWallet } =
    useStore();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  const rec = recommendations.find((r) => r.id === recId);

  if (!rec) {
    return (
      <section className="mx-auto max-w-xl px-4 pt-40 text-center">
        <p className="font-serif text-2xl text-blue-ink">Recommendation not found.</p>
        <Button className="mt-6" variant="outline" onClick={() => navigate("/matches")}>
          Back to matches
        </Button>
      </section>
    );
  }

  const done = ["RECORDED_ON_CHAIN", "WON", "LOST", "CLAIMED"].includes(rec.state);
  const pending = rec.state === "TRANSACTION_PENDING";
  const expired = ["EXPIRED", "REJECTED", "VOID"].includes(rec.state);
  const remainingRisk = Math.max(0, prefs.maxDailyLoss - dailyLoss);
  const canSign = typed.trim().toUpperCase() === "BET" && !busy && !pending;

  return (
    <section className="mx-auto max-w-xl px-4 pt-24 pb-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="border-2 border-blue bg-white"
      >
        <div className="border-b border-hairline bg-blue-faint px-6 py-3">
          <span className="font-mono text-[11px] tracking-[0.25em] text-blue uppercase">
            Confirm live bet plan
          </span>
        </div>

        <div className="p-6">
          <h1 className="font-serif text-[26px] leading-snug text-blue-ink">
            Confirm the agent's <span className="italic text-blue">live plan.</span>
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-blue-ink/70">
            Sign with MetaMask to stake SOL on Solana. The agent watches the match — you decide
            whether this plan goes through.
          </p>

          <div className="mt-5 border border-hairline">
            {[
              ["Match", rec.matchLabel],
              ["Market", "1X2 — Match Result"],
              ["Selection", `${rec.selection}${rec.selection !== "Draw" ? " Win" : ""}`],
              ["Stake", `${rec.stake} SOL`],
              ["Odds", rec.odds.toFixed(2)],
              ["Potential payout", `${rec.payout} SOL`],
              ["Current balance", fmtSol(balance)],
              ["Remaining daily risk", fmtSol(remainingRisk)],
            ].map(([k, v]) => (
              <div
                key={k}
                className="flex justify-between border-b border-hairline px-4 py-2.5 font-mono text-[12px] last:border-b-0"
              >
                <span className="text-blue-mid">{k}</span>
                <span className="font-bold text-blue-ink">{v}</span>
              </div>
            ))}
          </div>

          {done ? (
            <div className="mt-5 border border-blue bg-blue-wash p-4 text-center">
              <p className="font-serif text-xl text-blue-ink">
                Bet <span className="italic text-blue">recorded on-chain.</span>
              </p>
              {rec.txHash && (
                <p className="mt-1 truncate font-mono text-[10.5px] text-blue-mid">{rec.txHash}</p>
              )}
              <div className="mt-3 flex justify-center gap-2">
                <Button size="sm" onClick={() => navigate(`/matches/${rec.fixtureId}`)}>
                  Back to match
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigate("/portfolio")}>
                  View portfolio
                </Button>
              </div>
            </div>
          ) : expired ? (
            <p className="mt-5 border border-hairline bg-blue-faint p-4 text-center font-mono text-[12px] text-blue-mid">
              This recommendation is {rec.state.toLowerCase()} and can no longer be confirmed.
            </p>
          ) : (
            <>
              {!address && (
                <Button className="mt-5 w-full" variant="outline" onClick={connectWallet}>
                  Connect MetaMask first
                </Button>
              )}
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="TYPE BET TO CONFIRM"
                className="mt-5 w-full border border-hairline bg-blue-faint px-4 py-3 font-mono text-[12px] tracking-[0.25em] text-blue-ink placeholder:text-blue-soft focus:border-blue focus:outline-none"
              />
              <div className="mt-4 flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => navigate(`/matches/${rec.fixtureId}`)}
                >
                  Go back
                </Button>
                <Button
                  className="flex-1"
                  disabled={!canSign || !address || rec.stake > balance}
                  onClick={async () => {
                    setBusy(true);
                    await confirmBet(rec.id);
                    setBusy(false);
                  }}
                >
                  {pending || busy ? "Waiting for signature…" : "Sign with MetaMask"}
                </Button>
              </div>
              {rec.stake > balance && (
                <p className="mt-2 text-center font-mono text-[11px] text-blue-deep">
                  Insufficient SOL balance for this stake.
                </p>
              )}
            </>
          )}
        </div>
      </motion.div>
    </section>
  );
}
