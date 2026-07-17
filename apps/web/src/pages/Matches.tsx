import MatchCard from "@/components/MatchCard";
import { useStore } from "@/store";
import { navigate } from "@/lib/router";

export default function Matches() {
  const { fixtures, loadFixture, replay, startReplay } = useStore();

  return (
    <section className="mx-auto max-w-6xl px-4 pt-24 pb-20 sm:px-6">
      <p className="mb-2 font-mono text-[11px] tracking-[0.25em] text-blue uppercase">
        ● Live World Cup fixtures
      </p>
      <h1 className="font-serif text-4xl tracking-tight text-blue-ink">
        Today's <span className="italic text-blue">matches.</span>
      </h1>
      <p className="mt-2 max-w-xl text-[14px] text-blue-ink/70">
        Pick a fixture to open the live match centre. The agent watches the game and builds a
        bet plan — you confirm before any SOL is staked.
      </p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {fixtures.map((f, i) => (
          <MatchCard
            key={f.fixtureId}
            fixture={f}
            index={i}
            onOpen={async () => {
              if (replay.timeline?.fixtureId !== f.fixtureId) {
                await loadFixture(f.fixtureId);
                startReplay();
              }
              navigate(`/matches/${f.fixtureId}`);
            }}
          />
        ))}
      </div>
      {fixtures.length === 0 && (
        <p className="mt-12 text-center font-mono text-[12px] text-blue-mid">
          Loading today's fixtures…
        </p>
      )}
    </section>
  );
}
