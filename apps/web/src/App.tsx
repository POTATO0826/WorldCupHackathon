import { useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Home from "@/pages/Home";
import Matches from "@/pages/Matches";
import MatchCentre from "@/pages/MatchCentre";
import Confirm from "@/pages/Confirm";
import Portfolio from "@/pages/Portfolio";
import History from "@/pages/History";
import Settings from "@/pages/Settings";
import Replay from "@/pages/Replay";
import GoalIntro from "@/components/GoalIntro";
import ChromaticWaves from "@/components/originkit/ChromaticWaves";
import { useRoute } from "@/lib/router";
import { StoreProvider } from "@/store";

function Router() {
  const { parts } = useRoute();
  const [head, arg] = [parts[0], parts[1]];

  if (!head) return <Home />;
  if (head === "matches" && arg) return <MatchCentre fixtureId={arg} />;
  if (head === "matches") return <Matches />;
  if (head === "confirm" && arg) return <Confirm recId={arg} />;
  if (head === "portfolio") return <Portfolio />;
  if (head === "history") return <History />;
  if (head === "settings") return <Settings />;
  if (head === "replay") return <Replay />;
  return <Home />;
}

export default function App() {
  const { parts } = useRoute();
  const isHome = parts.length === 0;
  // Skip the kick intro when deep-linking into another page
  const [introDone, setIntroDone] = useState(!isHome);
  const showIntro = isHome && !introDone;

  return (
    <StoreProvider>
      {/* Soft waves stay behind content — never bleed through solid panels */}
      <div className="pointer-events-none fixed inset-0 z-0 opacity-45">
        <ChromaticWaves
          frequency={1.8}
          speed={1.6}
          bgColor="#fdfdfe"
          cellSize={52}
          gamma={11}
          paletteBias={-6}
        />
      </div>

      {showIntro && <GoalIntro onDone={() => setIntroDone(true)} />}

      {/* Hide the app chrome while the kick intro owns the screen */}
      <main
        className={`relative z-10 flex min-h-screen flex-col ${showIntro ? "invisible" : ""}`}
        aria-hidden={showIntro}
      >
        <Navbar />
        <div className="flex-1">
          <Router />
        </div>
        <Footer />
      </main>
    </StoreProvider>
  );
}
