import Logo from "@/components/Logo";

export default function Footer() {
  return (
    <footer className="border-t border-hairline bg-paper">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Logo size={22} />
          <span className="text-[13.5px] font-semibold text-blue-ink">
            World Cup <span className="font-serif italic text-blue">Betting Agent</span>
          </span>
        </div>
        <p className="font-mono text-[10.5px] leading-relaxed text-blue-mid">
          Live betting agent · SOL on Solana · you confirm every plan ·
          the agent does not guarantee profit
        </p>
      </div>
    </footer>
  );
}
