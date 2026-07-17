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
import GlitterWrap from "@/components/originkit/GlitterWrap";
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
  const [introDone, setIntroDone] = useState(!isHome);
  const showIntro = isHome && !introDone;

  return (
    <StoreProvider>
      {/* Originkit GlitterWrap — soft blue starfield behind solid UI panels */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <GlitterWrap
          lightMode
          particleCount={560}
          color1="#3347e0"
          color2="#6b7aeb"
          color3="#aeb7f4"
          speed={2.6}
          density={85}
          starSize={14}
          focalDepth={9}
          glitterIntensity={5}
          trailAmount={40}
          brightness={70}
          background="#fdfdfe"
        />
      </div>

      {showIntro && <GoalIntro onDone={() => setIntroDone(true)} />}

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
