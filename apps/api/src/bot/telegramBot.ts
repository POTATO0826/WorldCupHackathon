/**
 * Telegram bot (spec §15) — the messaging loop over the simulation orchestrator.
 *
 * Runs in-process with direct access to `SimulationEngine` (no extra network
 * hop). Chats subscribe with /start; the bot pushes each live recommendation
 * with inline Confirm / Skip buttons plus a deep-link to the web /confirm page,
 * and posts a settlement message when a bet resolves. Confirmation requires the
 * user to tap a button (spec §15.2: agent never auto-bets).
 *
 * MVP scope: a single shared simulation wallet, chat subscriptions held in
 * memory. A production build would map each chat to its own wallet + a DB.
 */

import { Bot, InlineKeyboard } from "grammy";
import type { SimulationEngine } from "../orchestrator/simulationEngine.js";
import type { OrchestratorEvent, Recommendation } from "../orchestrator/types.js";

export interface TelegramBotOptions {
  token: string;
  webOrigin: string;
  /** Fixture id -> "Home v Away" for readable messages. */
  fixtureLabel: (fixtureId: string) => string;
}

export interface TelegramBotHandle {
  stop: () => Promise<void>;
  username: string;
}

const selName = (rec: Recommendation, label: string): string => {
  const [home, away] = label.split(" v ");
  return rec.selection === "Home" ? home! : rec.selection === "Away" ? away! : "Draw";
};

function recMessage(rec: Recommendation, label: string): string {
  const pick = selName(rec, label);
  const payout = (rec.stake * rec.simulatedOdds).toFixed(0);
  return (
    `⚽ *${escapeMd(label)}*\n` +
    `🤖 *${escapeMd(rec.decision.strategyName)}* suggests: *${escapeMd(pick)}* @ ${rec.simulatedOdds.toFixed(2)}\n` +
    `Confidence: *${rec.decision.confidence}%*  ·  Stake: *${rec.stake} WCDT*  ·  Payout: *${payout} WCDT*\n\n` +
    `_${escapeMd(rec.decision.reason)}_`
  );
}

/** Telegram MarkdownV2 requires escaping these characters. */
function escapeMd(s: string): string {
  return s.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`);
}

export async function startTelegramBot(
  engine: SimulationEngine,
  opts: TelegramBotOptions,
): Promise<TelegramBotHandle> {
  const bot = new Bot(opts.token);
  const chats = new Set<number>();

  bot.command("start", async (ctx) => {
    if (ctx.chat) chats.add(ctx.chat.id);
    await ctx.reply(
      "🏆 *World Cup Betting Agent* \\(simulation\\)\n\n" +
        "You're linked\\. I'll message you live recommendations from PressureEdgeV1 as fixtures play out\\. " +
        "Tap *Confirm* to place a simulated on\\-chain bet\\.\n\n" +
        "Commands: /portfolio  /briefing  /help",
      { parse_mode: "MarkdownV2" },
    );
  });

  bot.command("help", (ctx) =>
    ctx.reply(
      "Commands:\n/start - link this chat\n/briefing - fixtures overview\n/portfolio - balance & bets\n\nRecommendations arrive automatically while a match replays.",
    ),
  );

  bot.command("briefing", async (ctx) => {
    const lines = engine.listFixtures().map((f) => {
      const sc = f.state ? `${f.state.score.home}-${f.state.score.away}` : "0-0";
      return `• ${f.homeTeam} v ${f.awayTeam} — ${f.status} (${sc})`;
    });
    await ctx.reply(`📋 Today's fixtures:\n${lines.join("\n")}`);
  });

  bot.command("portfolio", async (ctx) => {
    const p = engine.getPortfolio();
    const open = p.bets.filter((b) => b.state === "RECORDED_ON_CHAIN").length;
    await ctx.reply(
      `💼 Portfolio\nBalance: ${p.balance} WCDT\nStaked: ${p.staked} WCDT\nOpen bets: ${open}\nRealised P&L: ${p.realisedPnl >= 0 ? "+" : ""}${p.realisedPnl} WCDT`,
    );
  });

  // Inline button handlers.
  bot.callbackQuery(/^confirm:(.+)$/, async (ctx) => {
    const id = ctx.match![1]!;
    try {
      const rec = await engine.confirmRecommendation(id);
      await ctx.answerCallbackQuery({ text: "Bet placed ✅" });
      await ctx.editMessageText(
        `✅ Bet placed on *${escapeMd(selName(rec, opts.fixtureLabel(rec.fixtureId)))}* — ${rec.stake} WCDT @ ${rec.simulatedOdds.toFixed(2)}\n\`${escapeMd(rec.txSignature ?? "")}\``,
        { parse_mode: "MarkdownV2" },
      );
    } catch (e) {
      await ctx.answerCallbackQuery({ text: msg(e), show_alert: true });
    }
  });

  bot.callbackQuery(/^skip:(.+)$/, async (ctx) => {
    const id = ctx.match![1]!;
    try {
      engine.rejectRecommendation(id);
      await ctx.answerCallbackQuery({ text: "Skipped" });
      await ctx.editMessageText("⏭ Skipped this recommendation.");
    } catch (e) {
      await ctx.answerCallbackQuery({ text: msg(e), show_alert: true });
    }
  });

  // Push orchestrator events to subscribed chats.
  const unsubscribe = engine.onEvent((event: OrchestratorEvent) => {
    if (event.type === "recommendation" && event.recommendation.state === "AWAITING_CONFIRMATION") {
      const rec = event.recommendation;
      const label = opts.fixtureLabel(rec.fixtureId);
      const kb = new InlineKeyboard()
        .text("✅ Confirm", `confirm:${rec.id}`)
        .text("⏭ Skip", `skip:${rec.id}`)
        .row()
        .url("🌐 Open", `${opts.webOrigin}/confirm/${rec.id}`);
      for (const chatId of chats) {
        void bot.api
          .sendMessage(chatId, recMessage(rec, label), { parse_mode: "MarkdownV2", reply_markup: kb })
          .catch(() => undefined);
      }
    } else if (event.type === "settlement") {
      const rec = engine.getRecommendation(event.recommendationId);
      const label = opts.fixtureLabel(event.fixtureId);
      const emoji = event.result === "WON" ? "🎉" : event.result === "LOST" ? "❌" : "↩️";
      const tail =
        event.result === "WON" && rec ? ` — claim ${(rec.stake * rec.simulatedOdds).toFixed(0)} WCDT in the app` : "";
      for (const chatId of chats) {
        void bot.api
          .sendMessage(chatId, `${emoji} ${label}: your bet ${event.result}${tail}`)
          .catch(() => undefined);
      }
    }
  });

  const me = await bot.api.getMe();
  // Long polling (no public webhook needed for the demo).
  void bot.start({ drop_pending_updates: true });

  return {
    username: me.username,
    stop: async () => {
      unsubscribe();
      await bot.stop();
    },
  };
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
