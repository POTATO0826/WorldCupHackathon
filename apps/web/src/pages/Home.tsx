import { motion } from "framer-motion";
import DitherArt from "@/components/DitherArt";
import { footballPainter } from "@/lib/painters";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store";
import { navigate } from "@/lib/router";
import { fmtSol, shortAddress } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

function RevealWord({ children, delay }: { children: string; delay: number }) {
  return (
    <span className="inline-block overflow-hidden pb-1 align-bottom">
      <motion.span
        initial={{ y: "115%" }}
        animate={{ y: 0 }}
        transition={{ duration: 0.85, delay, ease: EASE }}
        className="mr-[0.26em] inline-block"
      >
        {children}
      </motion.span>
    </span>
  );
}

function Step({
  n,
  title,
  desc,
  done,
  action,
  actionLabel,
  disabled,
}: {
  n: number;
  title: string;
  desc: string;
  done: boolean;
  action?: () => void;
  actionLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-4 border-b border-hairline px-5 py-4 last:border-b-0">
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center font-mono text-[12px] font-bold ${
          done ? "bg-blue text-white" : "border border-blue/40 text-blue"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-blue-ink">{title}</p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-blue-ink/65">{desc}</p>
      </div>
      {!done && action && (
        <Button size="sm" variant="outline" onClick={action} disabled={disabled}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export default function Home() {
  const {
    address,
    balance,
    faucetClaimed,
    connectWallet,
    claimFaucet,
    telegramLinked,
    telegramCode,
    linkTelegram,
  } = useStore();

  const line1 = ["Watch", "live,",];
  const ready = !!address && faucetClaimed && telegramLinked;

  return (
    <section className="mx-auto max-w-6xl px-4 pt-24 sm:px-6 lg:pt-28">
      <div className="grid gap-10 border border-hairline bg-paper lg:grid-cols-[1.05fr_1fr]">
        <div className="relative flex flex-col justify-start overflow-hidden border-b border-hairline p-6 sm:p-10 lg:border-r lg:border-b-0">
          <div className="relative z-10">
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.6 }}
              className="mb-5 font-mono text-[11px] tracking-[0.25em] text-blue uppercase"
            >
              ● Live World Cup betting agent
            </motion.p>
            <h1 className="font-serif text-[clamp(2.6rem,5.6vw,4.4rem)] leading-[1.04] tracking-tight text-blue-ink">
              {line1.map((w, i) => (
                <RevealWord key={w} delay={0.25 + i * 0.09}>
                  {w}
                </RevealWord>
              ))}
              <br />
              <span className="inline-block overflow-hidden pb-2 align-bottom">
                <motion.span
                  initial={{ y: "115%" }}
                  animate={{ y: 0 }}
                  transition={{ duration: 0.9, delay: 0.55, ease: EASE }}
                  className="inline-block italic text-blue"
                >
                  confirm the plan.
                </motion.span>
              </span>
            </h1>
            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.75, duration: 0.7, ease: EASE }}
              className="mt-5 max-w-md text-[15px] leading-relaxed text-blue-ink/75"
            >
              Your agent watches the live match, builds a Home / Draw / Away plan with stake and
              reason, then waits for you. Nothing goes on-chain until you confirm with MetaMask —
              settled in SOL on Solana.
            </motion.p>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1, duration: 0.7 }}
              className="mt-4 inline-block border border-hairline bg-blue-faint px-3 py-1.5 font-mono text-[11.5px] text-blue"
            >
              The agent watches. You confirm every bet.
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.9, duration: 1.2, ease: EASE }}
            className="relative z-10 mx-auto mt-6 w-full max-w-[340px]"
          >
            <div className="h-[260px] overflow-hidden sm:h-[300px]">
              <DitherArt painter={footballPainter} pixelSize={3} timeScale={0.8} />
            </div>
            <p className="pointer-events-none mt-4 text-center font-mono text-[10px] tracking-[0.2em] text-blue-mid uppercase">
              live feed · agent on · confirm before stake
            </p>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.8, ease: EASE }}
          className="flex flex-col p-6 sm:p-8 lg:p-10"
        >
          <div className="border border-hairline">
            <div className="flex items-center justify-between border-b border-hairline bg-blue-faint px-5 py-3">
              <span className="font-mono text-[11px] tracking-[0.2em] text-blue uppercase">
                Get match-day ready
              </span>
              <span className="font-mono text-[11px] text-blue-mid">≡ Solana</span>
            </div>

            <Step
              n={1}
              title="Connect MetaMask"
              desc={
                address
                  ? `Connected as ${shortAddress(address)}`
                  : "One wallet per user. Signature-based login, no passwords."
              }
              done={!!address}
              action={connectWallet}
              actionLabel="Connect"
            />
            <Step
              n={2}
              title="Claim 10 SOL"
              desc={
                faucetClaimed
                  ? `Balance: ${fmtSol(balance)} — ready for live stakes.`
                  : "Fund your agent wallet with SOL from the faucet."
              }
              done={faucetClaimed}
              action={claimFaucet}
              actionLabel="Claim"
              disabled={!address}
            />
            <Step
              n={3}
              title="Link Telegram"
              desc={
                telegramLinked
                  ? "Linked — live plans and results arrive in chat."
                  : `Send /start ${telegramCode} to the bot. Instant for this demo.`
              }
              done={telegramLinked}
              action={linkTelegram}
              actionLabel="Link"
              disabled={!address}
            />

            <div className="p-5">
              <Button
                className="w-full"
                size="lg"
                disabled={!ready}
                onClick={() => navigate("/matches")}
              >
                {ready ? "Enter live matches →" : "Complete the steps above"}
              </Button>
              <p className="mt-3 text-center font-mono text-[10.5px] leading-relaxed text-blue-mid">
                The agent only proposes a plan — every bet needs your
                <br />
                confirmation and MetaMask signature.
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-px border border-hairline bg-hairline">
            {[
              ["01", "Watch", "Agent reads live score, events and odds"],
              ["02", "Plan", "Home / Draw / Away with stake + reason"],
              ["03", "Confirm", "You sign — SOL settles after full time"],
            ].map(([n, t, d]) => (
              <div key={n} className="bg-paper p-4">
                <p className="font-mono text-[10px] text-blue-mid">{n}</p>
                <p className="mt-1 text-[13px] font-semibold text-blue-ink">{t}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-blue-ink/60">{d}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
