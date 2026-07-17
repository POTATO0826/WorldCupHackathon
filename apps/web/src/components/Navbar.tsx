import { motion } from "framer-motion";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store";
import { navigate, useRoute } from "@/lib/router";
import { shortAddress, fmtSol } from "@/lib/utils";

const LINKS = [
  { label: "Matches", href: "/matches" },
  { label: "Live Desk", href: "/replay" },
  { label: "Portfolio", href: "/portfolio" },
  { label: "History", href: "/history" },
  { label: "Settings", href: "/settings" },
];

export default function Navbar() {
  const { address, balance, connectWallet } = useStore();
  const route = useRoute();

  return (
    <motion.header
      initial={{ y: -56, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-0 top-0 z-50 border-b border-hairline bg-paper/95 backdrop-blur-md"
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <button onClick={() => navigate("/")} className="flex cursor-pointer items-center gap-2.5">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight text-blue-ink">
            World Cup <span className="font-serif italic text-blue">Betting Agent</span>
          </span>
        </button>

        <nav className="hidden items-center gap-6 md:flex">
          {LINKS.map((l) => (
            <button
              key={l.label}
              onClick={() => navigate(l.href)}
              className={`cursor-pointer text-[13px] font-medium transition-colors hover:text-blue ${
                route.path.startsWith(l.href) ? "text-blue" : "text-blue-ink/70"
              }`}
            >
              {l.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 border border-blue/25 bg-blue-faint px-3 py-1.5 font-mono text-[11px] text-blue sm:flex">
            <motion.span
              animate={{ opacity: [1, 0.25, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="h-1.5 w-1.5 bg-blue"
            />
            Solana · Live
          </span>
          {address ? (
            <span className="border border-blue bg-blue-wash px-3 py-1.5 font-mono text-[11.5px] font-medium text-blue">
              {fmtSol(balance)} · {shortAddress(address)}
            </span>
          ) : (
            <Button size="sm" onClick={connectWallet} className="h-9 px-4">
              Connect Wallet
            </Button>
          )}
        </div>
      </div>
    </motion.header>
  );
}
