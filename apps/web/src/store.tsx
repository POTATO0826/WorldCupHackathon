import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ReplayEngine, type ReplaySnapshot } from "@/lib/replay";
import { evaluate, type AgentDecision } from "@/lib/agent";
import { FEATURED_LIVE, seedLivePlan } from "@/lib/liveDesk";
import type {
  AgentSkip,
  FixtureSummary,
  Preferences,
  Recommendation,
  ReplaySpeed,
  Selection,
} from "@/lib/types";
import { fakeSolAddress, fakeTxHash } from "@/lib/utils";

const FAUCET_AMOUNT = 10;
const AGENT_INTERVAL_MS = 4000;

interface EthProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

declare global {
  interface Window {
    ethereum?: EthProvider;
  }
}

export interface Store {
  // wallet
  address: string | null;
  balance: number;
  faucetClaimed: boolean;
  connectWallet: () => Promise<void>;
  claimFaucet: () => void;
  // telegram
  telegramLinked: boolean;
  telegramCode: string;
  linkTelegram: () => void;
  // preferences
  prefs: Preferences;
  setPrefs: (p: Partial<Preferences>) => void;
  // fixtures + replay
  fixtures: FixtureSummary[];
  replay: ReplaySnapshot;
  loadFixture: (id: string) => Promise<void>;
  /** Open a fixture mid-match as a live desk board (hardcoded seek + plan). */
  goLive: (id?: string) => Promise<void>;
  startReplay: () => void;
  pauseReplay: () => void;
  resumeReplay: () => void;
  restartReplay: () => void;
  setSpeed: (s: ReplaySpeed) => void;
  // agent
  lastDecision: AgentDecision | null;
  skips: AgentSkip[];
  recommendations: Recommendation[];
  rejectRecommendation: (id: string) => void;
  changeStake: (id: string, stake: number) => void;
  confirmBet: (id: string) => Promise<void>;
  claimWinnings: (id: string) => void;
  dailyLoss: number;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("StoreProvider missing");
  return s;
}

const engine = new ReplayEngine();

export function StoreProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [faucetClaimed, setFaucetClaimed] = useState(false);
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [telegramCode] = useState(() =>
    Math.random().toString(36).slice(2, 8).toUpperCase(),
  );
  const [prefs, setPrefsState] = useState<Preferences>({
    minConfidence: 65,
    maxStake: 1,
    maxDailyLoss: 5,
    mode: "balanced",
    telegramEnabled: true,
    favouriteTeams: [],
  });
  const [fixtures, setFixtures] = useState<FixtureSummary[]>([]);
  const [replay, setReplay] = useState<ReplaySnapshot>(engine.snapshot());
  const [lastDecision, setLastDecision] = useState<AgentDecision | null>(null);
  const [skips, setSkips] = useState<AgentSkip[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const settledRef = useRef<Set<string>>(new Set());
  const lastAgentRunRef = useRef(0);
  const recsRef = useRef(recommendations);
  recsRef.current = recommendations;
  const balanceRef = useRef(balance);
  balanceRef.current = balance;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  useEffect(() => {
    fetch("/replay/index.json")
      .then((r) => r.json())
      .then(setFixtures)
      .catch(() => setFixtures([]));
  }, []);

  useEffect(() => engine.subscribe(setReplay), []);

  const dailyLoss = useMemo(
    () =>
      recommendations
        .filter((r) => r.state === "LOST")
        .reduce((sum, r) => sum + r.stake, 0),
    [recommendations],
  );
  const dailyLossRef = useRef(dailyLoss);
  dailyLossRef.current = dailyLoss;

  // ---- agent loop: evaluate the live state on an interval ----
  useEffect(() => {
    if (replay.status !== "running" || !replay.state || !replay.timeline) return;
    const now = Date.now();
    if (now - lastAgentRunRef.current < AGENT_INTERVAL_MS) return;
    lastAgentRunRef.current = now;

    const tl = replay.timeline;
    const decision = evaluate(
      replay.state,
      prefsRef.current,
      tl,
      balanceRef.current,
      dailyLossRef.current,
    );
    setLastDecision(decision);

    if (decision.type === "SKIP") {
      setSkips((prev) => [
        ...prev.slice(-19),
        { fixtureId: tl.fixtureId, reason: decision.skipReason ?? decision.reason, at: now },
      ]);
      return;
    }

    // one open recommendation per fixture market
    const open = recsRef.current.some(
      (r) =>
        r.fixtureId === tl.fixtureId &&
        ["CREATED", "SENT", "AWAITING_CONFIRMATION", "CONFIRMED", "TRANSACTION_PENDING", "RECORDED_ON_CHAIN"].includes(
          r.state,
        ),
    );
    if (open) return;

    const rec: Recommendation = {
      id: Math.random().toString(36).slice(2, 10),
      fixtureId: tl.fixtureId,
      matchLabel: `${tl.home.name} vs ${tl.away.name}`,
      market: "1X2",
      selection: decision.selection!,
      odds: decision.odds,
      confidence: decision.confidence,
      stake: decision.stake,
      payout: decision.payout,
      reason: decision.reason,
      state: "AWAITING_CONFIRMATION",
      createdAt: now,
    };
    setRecommendations((prev) => [rec, ...prev]);
  }, [replay]);

  // ---- mock oracle: settle when replay finishes ----
  useEffect(() => {
    const st = replay.state;
    const tl = replay.timeline;
    if (!st || !tl || replay.status !== "finished") return;
    if (settledRef.current.has(tl.fixtureId)) return;
    settledRef.current.add(tl.fixtureId);

    const { home, away } = tl.finalScore;
    const result: Selection = home > away ? "Home" : home < away ? "Away" : "Draw";

    setRecommendations((prev) =>
      prev.map((r) => {
        if (r.fixtureId !== tl.fixtureId) return r;
        if (r.state === "RECORDED_ON_CHAIN") {
          const won = r.selection === result;
          return {
            ...r,
            state: won ? "WON" : "LOST",
            finalScore: tl.finalScore,
            settledPayout: won ? r.payout : 0,
          };
        }
        if (["CREATED", "SENT", "AWAITING_CONFIRMATION", "CONFIRMED", "TRANSACTION_PENDING"].includes(r.state)) {
          return { ...r, state: "EXPIRED", finalScore: tl.finalScore };
        }
        return r;
      }),
    );
  }, [replay]);

  const connectWallet = useCallback(async () => {
    if (window.ethereum) {
      try {
        const accounts = (await window.ethereum.request({
          method: "eth_requestAccounts",
        })) as string[];
        if (accounts[0]) {
          setAddress(accounts[0]);
          return;
        }
      } catch {
        // fall through to simulated wallet
      }
    }
    // simulated Solana wallet when MetaMask / Solana provider is unavailable
    setAddress(fakeSolAddress());
  }, []);

  const claimFaucet = useCallback(() => {
    if (faucetClaimed) return;
    setFaucetClaimed(true);
    setBalance((b) => b + FAUCET_AMOUNT);
  }, [faucetClaimed]);

  const linkTelegram = useCallback(() => setTelegramLinked(true), []);

  const setPrefs = useCallback((p: Partial<Preferences>) => {
    setPrefsState((prev) => ({ ...prev, ...p }));
  }, []);

  const loadFixture = useCallback(async (id: string) => {
    settledRef.current.delete(id);
    await engine.load(id);
  }, []);

  const goLive = useCallback(async (id?: string) => {
    const fixtureId = id ?? FEATURED_LIVE.fixtureId;
    settledRef.current.delete(fixtureId);
    await engine.load(fixtureId);
    engine.setSpeed(FEATURED_LIVE.speed);
    // always drop into mid-match so the desk feels live, not kickoff
    engine.seekToClock(FEATURED_LIVE.seekClock);
    engine.start();

    // featured board gets a hardcoded ready plan
    if (fixtureId !== FEATURED_LIVE.fixtureId) return;
    setRecommendations((prev) => {
      const open = prev.some(
        (r) =>
          r.fixtureId === fixtureId &&
          ["CREATED", "SENT", "AWAITING_CONFIRMATION", "CONFIRMED", "TRANSACTION_PENDING", "RECORDED_ON_CHAIN"].includes(
            r.state,
          ),
      );
      if (open) return prev;
      const plan = seedLivePlan();
      setLastDecision({
        type: "BET",
        selection: plan.selection,
        confidence: plan.confidence,
        stake: plan.stake,
        odds: plan.odds,
        payout: plan.payout,
        reason: plan.reason,
        features: {
          minute: 42,
          score: "1-1",
          shots: "8/8",
          danger: "5/6",
          marketProb: "12.3%",
          modelProb: "18.0%",
          edge: "5.7%",
          selection: "Away",
        },
      });
      return [plan, ...prev];
    });
  }, []);

  const rejectRecommendation = useCallback((id: string) => {
    setRecommendations((prev) =>
      prev.map((r) =>
        r.id === id && r.state === "AWAITING_CONFIRMATION" ? { ...r, state: "REJECTED" } : r,
      ),
    );
  }, []);

  const changeStake = useCallback((id: string, stake: number) => {
    setRecommendations((prev) =>
      prev.map((r) => {
        if (r.id !== id || r.state !== "AWAITING_CONFIRMATION") return r;
        const capped =
          Math.round(
            Math.max(0.05, Math.min(stake, prefsRef.current.maxStake, balanceRef.current)) * 100,
          ) / 100;
        return { ...r, stake: capped, payout: Math.round(capped * r.odds * 100) / 100 };
      }),
    );
  }, []);

  const confirmBet = useCallback(async (id: string) => {
    const rec = recsRef.current.find((r) => r.id === id);
    if (!rec || rec.state !== "AWAITING_CONFIRMATION") return;
    if (rec.stake > balanceRef.current) return;

    setRecommendations((prev) =>
      prev.map((r) => (r.id === id ? { ...r, state: "TRANSACTION_PENDING" } : r)),
    );

    // MetaMask personal_sign as the demo "signature" when available
    if (window.ethereum && address) {
      try {
        await window.ethereum.request({
          method: "personal_sign",
          params: [
            `LIVE BET PLAN\nMatch: ${rec.matchLabel}\nSelection: ${rec.selection}\nStake: ${rec.stake} SOL\nOdds: ${rec.odds}\nPlan: ${rec.id}`,
            address,
          ],
        });
      } catch {
        setRecommendations((prev) =>
          prev.map((r) => (r.id === id ? { ...r, state: "AWAITING_CONFIRMATION" } : r)),
        );
        return;
      }
    } else {
      await new Promise((r) => setTimeout(r, 900));
    }

    setBalance((b) => b - rec.stake);
    setRecommendations((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, state: "RECORDED_ON_CHAIN", txHash: fakeTxHash() } : r,
      ),
    );
  }, [address]);

  const claimWinnings = useCallback((id: string) => {
    setRecommendations((prev) =>
      prev.map((r) => {
        if (r.id !== id || r.state !== "WON") return r;
        setBalance((b) => b + (r.settledPayout ?? 0));
        return { ...r, state: "CLAIMED" };
      }),
    );
  }, []);

  const store: Store = {
    address,
    balance,
    faucetClaimed,
    connectWallet,
    claimFaucet,
    telegramLinked,
    telegramCode,
    linkTelegram,
    prefs,
    setPrefs,
    fixtures,
    replay,
    loadFixture,
    goLive,
    startReplay: () => engine.start(),
    pauseReplay: () => engine.pause(),
    resumeReplay: () => engine.resume(),
    restartReplay: () => engine.restart(),
    setSpeed: (s) => engine.setSpeed(s),
    lastDecision,
    skips,
    recommendations,
    rejectRecommendation,
    changeStake,
    confirmBet,
    claimWinnings,
    dailyLoss,
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
