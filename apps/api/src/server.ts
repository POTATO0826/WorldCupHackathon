/**
 * Fastify + Socket.IO server exposing the simulation orchestrator (spec §18).
 *
 * REST drives fixtures / replay controls / recommendations / portfolio; the
 * Socket.IO channel streams live `state`, `recommendation`, `bet`,
 * `settlement`, and `portfolio` events (§18.7). Uses the mock chain gateway by
 * default so it runs with no validator; swap in a Solana gateway later.
 */

import Fastify from "fastify";
import cors from "@fastify/cors";
import { Server as IOServer } from "socket.io";
import type { ReplaySpeed } from "@wc/shared-types";
import { SimulationEngine } from "./orchestrator/simulationEngine.js";
import { MockChainGateway } from "./chain/mockChain.js";

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? "0.0.0.0";
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const TTL_SECONDS = Number(process.env.RECOMMENDATION_TTL_SECONDS ?? 300);

const VALID_SPEEDS: ReadonlySet<number> = new Set([1, 10, 30, 60]);
const asSpeed = (v: unknown): ReplaySpeed => {
  const n = Number(v);
  return (VALID_SPEEDS.has(n) ? n : 30) as ReplaySpeed;
};

export function buildServer(engine: SimulationEngine) {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: WEB_ORIGIN, credentials: true });

  app.get("/health", async () => ({ ok: true, chain: "mock" }));

  // --- fixtures / replay ---
  app.get("/api/fixtures", async () => ({ fixtures: engine.listFixtures() }));

  app.get<{ Params: { id: string } }>("/api/fixtures/:id", async (req, reply) => {
    try {
      return { fixture: engine.fixtureView(req.params.id) };
    } catch (err) {
      return reply.code(404).send({ error: msg(err) });
    }
  });

  app.post<{ Params: { id: string }; Body: { action?: string; speed?: number } }>(
    "/api/fixtures/:id/replay",
    async (req, reply) => {
      const { id } = req.params;
      const action = req.body?.action ?? "start";
      try {
        switch (action) {
          case "start":
            await engine.startReplay(id, asSpeed(req.body?.speed));
            break;
          case "pause":
            await engine.pauseReplay(id);
            break;
          case "resume":
            await engine.resumeReplay(id);
            break;
          case "setSpeed":
            await engine.setSpeed(id, asSpeed(req.body?.speed));
            break;
          case "step":
            await engine.stepToNextRecommendationOrEnd(id);
            break;
          default:
            return reply.code(400).send({ error: `unknown action ${action}` });
        }
        return { fixture: engine.fixtureView(id) };
      } catch (err) {
        return reply.code(400).send({ error: msg(err) });
      }
    },
  );

  // --- recommendations ---
  app.get("/api/recommendations", async () => ({
    recommendations: engine.getRecommendations(),
  }));

  app.post<{ Params: { id: string }; Body: { stake?: number } }>(
    "/api/recommendations/:id/confirm",
    async (req, reply) => {
      try {
        const rec = await engine.confirmRecommendation(req.params.id, req.body?.stake);
        return { recommendation: rec };
      } catch (err) {
        return reply.code(400).send({ error: msg(err) });
      }
    },
  );

  app.post<{ Params: { id: string } }>("/api/recommendations/:id/reject", async (req, reply) => {
    try {
      return { recommendation: engine.rejectRecommendation(req.params.id) };
    } catch (err) {
      return reply.code(400).send({ error: msg(err) });
    }
  });

  app.post<{ Params: { id: string }; Body: { stake: number } }>(
    "/api/recommendations/:id/stake",
    async (req, reply) => {
      try {
        return { recommendation: engine.changeStake(req.params.id, Number(req.body?.stake)) };
      } catch (err) {
        return reply.code(400).send({ error: msg(err) });
      }
    },
  );

  app.post<{ Params: { id: string } }>("/api/recommendations/:id/claim", async (req, reply) => {
    try {
      return { recommendation: await engine.claimWinnings(req.params.id) };
    } catch (err) {
      return reply.code(400).send({ error: msg(err) });
    }
  });

  // --- preferences / wallet / portfolio ---
  app.get("/api/preferences", async () => ({ preferences: engine.getPreferences() }));
  app.put<{ Body: Record<string, unknown> }>("/api/preferences", async (req) => ({
    preferences: engine.setPreferences(req.body ?? {}),
  }));
  app.post<{ Body: { amount?: number } }>("/api/faucet", async (req) => ({
    balance: engine.faucet(req.body?.amount ?? 1000),
  }));
  app.get("/api/portfolio", async () => ({ portfolio: engine.getPortfolio() }));

  return app;
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function main(): Promise<void> {
  const engine = new SimulationEngine({ chain: new MockChainGateway(), ttlSeconds: TTL_SECONDS });
  const app = buildServer(engine);

  const io = new IOServer(app.server, { cors: { origin: WEB_ORIGIN, credentials: true } });
  io.on("connection", (socket) => {
    socket.emit("snapshot", {
      fixtures: engine.listFixtures(),
      recommendations: engine.getRecommendations(),
      portfolio: engine.getPortfolio(),
    });
  });
  engine.onEvent((event) => io.emit(event.type, event));

  await app.listen({ port: PORT, host: HOST });
  app.log.info(`WC betting API on http://${HOST}:${PORT} (mock chain, ttl ${TTL_SECONDS}s)`);
}

// Run only when executed directly (not when imported by tests).
if (process.argv[1] && process.argv[1].endsWith("server.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
