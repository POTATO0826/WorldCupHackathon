import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { FixtureSummary } from "@/lib/types";
import { useStore } from "@/store";
import { phaseLabel } from "@/lib/replay";
import { fmtClock } from "@/lib/utils";

const DESCRIPTIONS: Record<string, string> = {
  "18209181": "A clinical night for the hosts — pressure builds until the breakthrough.",
  "18213979": "Extra-time drama with a late twist. Nothing about this one is quiet.",
  "18218149": "End-to-end trading of blows, settled by the finest of margins.",
  "18222446": "Extra time, the tournament's only red card, and a statement win.",
  "18237038": "A tactical away masterclass that silences the favourites.",
  "18241006": "A comeback story written in the second half. Hold your nerve.",
};

/**
 * Ticket-stub match card: notched frame, perforated divider, punch holes
 * and a barcode strip — every card is a match-day ticket.
 */
export default function MatchCard({
  fixture,
  index,
  onOpen,
}: {
  fixture: FixtureSummary;
  index: number;
  onOpen: () => void;
}) {
  const { replay } = useStore();
  const isLive =
    replay.timeline?.fixtureId === fixture.fixtureId &&
    (replay.status === "running" || replay.status === "paused");
  const live = isLive ? replay.state : null;

  // deterministic pseudo-barcode from the fixture id
  const bars = fixture.fixtureId
    .split("")
    .flatMap((c) => [Number(c) % 4 + 1, ((Number(c) * 7) % 3) + 1]);

  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4 }}
      className="group relative isolate bg-blue"
      style={{
        clipPath:
          "polygon(0 14px, 14px 0, calc(100% - 14px) 0, 100% 14px, 100% calc(100% - 14px), calc(100% - 14px) 100%, 14px 100%, 0 calc(100% - 14px))",
      }}
    >
      {/* inner paper inset creates the frame line */}
      <div
        className="relative m-[3px] bg-paper"
        style={{
          clipPath:
            "polygon(0 12px, 12px 0, calc(100% - 12px) 0, 100% 12px, 100% calc(100% - 12px), calc(100% - 12px) 100%, 12px 100%, 0 calc(100% - 12px))",
        }}
      >
        {/* artwork */}
        <div className="relative overflow-hidden border-b border-hairline">
          <img
            src={`/cards/card-${fixture.fixtureId}.png`}
            alt=""
            className="aspect-[3/2] w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
            loading="lazy"
          />
          {/* live score overlay */}
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-blue/90 px-3 py-1.5 font-mono text-[11px] text-white">
            {live ? (
              <>
                <span className="flex items-center gap-1.5">
                  <motion.span
                    animate={{ opacity: [1, 0.2, 1] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                    className="h-1.5 w-1.5 bg-white"
                  />
                  {phaseLabel(live.status)} · {fmtClock(live.clock)}
                </span>
                <span className="font-bold">
                  {live.score.home}–{live.score.away}
                </span>
              </>
            ) : (
              <>
                <span>#{fixture.fixtureId}</span>
                <span>KICK-OFF READY</span>
              </>
            )}
          </div>
          {/* punch hole */}
          <span className="absolute top-3 right-3 h-4 w-4 rounded-full border-2 border-blue bg-paper" />
        </div>

        {/* body */}
        <div className="p-4">
          <h3 className="font-serif text-[19px] leading-tight text-blue-ink">
            {fixture.home.name} <span className="font-mono text-[11px] text-blue-mid">vs</span>{" "}
            <span className="italic text-blue">{fixture.away.name}</span>
          </h3>
          <p className="mt-1.5 min-h-[34px] text-[11.5px] leading-relaxed text-blue-ink/65">
            {DESCRIPTIONS[fixture.fixtureId] ?? "Live World Cup fixture — agent watching."}
          </p>

          {/* perforation */}
          <div className="my-3 border-t-2 border-dashed border-hairline" />

          <div className="flex items-end justify-between gap-3">
            {/* barcode */}
            <div className="flex h-7 items-end gap-[2px]" aria-hidden>
              {bars.map((b, i) => (
                <span
                  key={i}
                  className="bg-blue-ink"
                  style={{ width: b >= 3 ? 3 : 1.5, height: `${55 + (b * 11) % 45}%` }}
                />
              ))}
            </div>
            <Button size="sm" onClick={onOpen}>
              {isLive ? "Rejoin live" : "Open match"}
            </Button>
          </div>
        </div>
      </div>
    </motion.article>
  );
}
