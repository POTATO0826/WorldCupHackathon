import { useStore } from "@/store";
import type { AgentMode } from "@/lib/types";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-4 last:border-b-0">
      <span className="text-[13.5px] font-semibold text-blue-ink">{label}</span>
      {children}
    </div>
  );
}

export default function Settings() {
  const { prefs, setPrefs, telegramLinked, linkTelegram, telegramCode } = useStore();

  const num = (v: string, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  return (
    <section className="mx-auto max-w-3xl px-4 pt-24 pb-20 sm:px-6">
      <p className="mb-2 font-mono text-[11px] tracking-[0.25em] text-blue uppercase">
        ● Agent & notification preferences
      </p>
      <h1 className="font-serif text-4xl tracking-tight text-blue-ink">
        Tune your <span className="italic text-blue">agent.</span>
      </h1>

      <div className="mt-8 border border-hairline">
        <Row label="Agent mode">
          <div className="flex gap-1">
            {(["conservative", "balanced", "aggressive"] as AgentMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setPrefs({ mode: m })}
                className={`cursor-pointer border px-3 py-1.5 font-mono text-[11px] capitalize transition-colors ${
                  prefs.mode === m
                    ? "border-blue bg-blue text-white"
                    : "border-blue/30 text-blue hover:bg-blue-wash"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Minimum confidence">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={50}
              max={95}
              value={prefs.minConfidence}
              onChange={(e) => setPrefs({ minConfidence: Number(e.target.value) })}
              className="accent-blue"
            />
            <span className="w-12 text-right font-mono text-[12px] font-bold text-blue">
              {prefs.minConfidence}%
            </span>
          </div>
        </Row>
        <Row label="Max stake per bet (SOL)">
          <input
            type="number"
            value={prefs.maxStake}
            onChange={(e) => setPrefs({ maxStake: num(e.target.value, prefs.maxStake) })}
            className="w-28 border border-hairline bg-blue-faint px-3 py-1.5 text-right font-mono text-[12px] text-blue-ink focus:border-blue focus:outline-none"
          />
        </Row>
        <Row label="Max daily virtual loss (SOL)">
          <input
            type="number"
            value={prefs.maxDailyLoss}
            onChange={(e) => setPrefs({ maxDailyLoss: num(e.target.value, prefs.maxDailyLoss) })}
            className="w-28 border border-hairline bg-blue-faint px-3 py-1.5 text-right font-mono text-[12px] text-blue-ink focus:border-blue focus:outline-none"
          />
        </Row>
        <Row label="Telegram notifications">
          {telegramLinked ? (
            <span className="border border-blue bg-blue-wash px-3 py-1.5 font-mono text-[11px] text-blue">
              ✓ linked
            </span>
          ) : (
            <button
              onClick={linkTelegram}
              className="cursor-pointer border border-blue/40 px-3 py-1.5 font-mono text-[11px] text-blue hover:bg-blue-wash"
            >
              link with /start {telegramCode}
            </button>
          )}
        </Row>
        <Row label="WhatsApp notifications">
          <span className="font-mono text-[11px] text-blue-mid">future integration</span>
        </Row>
        <Row label="Require confirmation before betting">
          <span className="border border-blue bg-blue-wash px-3 py-1.5 font-mono text-[11px] text-blue">
            always on (MVP)
          </span>
        </Row>
      </div>

      <p className="mt-6 border border-hairline bg-blue-faint px-4 py-3 font-mono text-[11px] leading-relaxed text-blue-mid">
        Confirmation stays on — the agent never stakes without your signature.
        All limits apply to your SOL balance.
      </p>
    </section>
  );
}
