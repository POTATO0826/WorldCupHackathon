# Handoff — World Cup Betting Agent (Solana)

Practical continuation guide. Read `README.md` for the product spec and
[`docs/SOLANA.md`](docs/SOLANA.md) for the authoritative chain design.

## TL;DR

Simulation-only World Cup betting agent, built to the repo's `README.md` spec **but on
Solana** (the spec's EVM/Hardhat/MetaMask stack was intentionally dropped — hackathon
requires Solana). Two phases are done and verified; three remain.

| Phase | Status | Where |
|---|---|---|
| 1 — TxLINE replay engine (chain-agnostic) | ✅ done, verified | `apps/replay-engine`, `packages/shared-types` |
| 2 — Anchor betting program + SPL WCDT | ✅ done, verified | `anchor/` |
| 3a — Rule-based agent (`PressureEdgeV1`) + state machine | ✅ done, verified | `packages/agent-core`, `packages/shared-types` |
| 3b — API + oracle + web confirm (on-chain bet flow) | ⏳ next | (new) `apps/api`, `apps/web` |
| 4 — Telegram bot (briefing/recommend/confirm/settle) | ⏳ | `apps/api` bot |
| 5 — Portfolio + polish + tests | ⏳ | `apps/web` |

## Environment / toolchain (IMPORTANT — not preinstalled)

Installed this session; future shells need this PATH:

```bash
export PATH="$HOME/.nix-profile/bin:$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
```

- **Rust** 1.97 (rustup, `rustup default stable`), **Solana CLI** 4.1.1 (Agave), **Anchor** 0.31.1.
- **gcc 15.2** installed via **Nix** (`nix profile add nixpkgs#gcc`) because no `cc` and no passwordless sudo. `cc`/`ld` come from `~/.nix-profile/bin`.
- **Gotcha 1 — use the real anchor binary:** run **`~/.avm/bin/anchor-0.31.1`**, NOT `anchor`. The avm proxy tries to auto-switch Solana to 2.1.0 and fails.
- **Gotcha 2 — active_release symlink:** avm's failed switch repointed `~/.local/share/solana/install/active_release` at a missing dir. It must point at `releases/stable-*/solana-release`. If `solana-keygen`/`cargo-build-sbf` "not found", fix the symlink.
- Deployer keypair: `~/.config/solana/id.json`.

## Build / test / run

```bash
# Phase 1 — replay engine (Node)
npm install                    # workspace root
npm run replay:verify          # all 6 fixtures -> real final scores
npx vitest run                 # unit + golden tests
npx tsc --noEmit -p tsconfig.json

# Phase 2 — Anchor program (needs the PATH above)
cd anchor
npm install
~/.avm/bin/anchor-0.31.1 build
~/.avm/bin/anchor-0.31.1 test  # local validator: initialize/faucet/bet/resolve/claim
```

## Program facts (Phase 2)

- Program id: **`2FTpj3gxeKv82Z8JKivPfajwcHLFeyZ5WpthzVyXSUgV`** (`declare_id!`, Anchor.toml localnet+devnet).
- Instructions: `initialize`, `faucet`, `create_market`, `close_market`, `place_bet`, `resolve_market`, `claim_winnings`.
- PDAs: `["config"]`, WCDT mint `["mint"]`, treasury = ATA(mint, config), `["market", id_le_u64]`, `["bet", id_le_u64, bettor]` (one bet per market per wallet), `["faucet", user]`.
- WCDT: 6 decimals, faucet 1,000. Fixed-odds payout `stake * odds_bps / 10_000` from a treasury seeded at `initialize`.
- Outcome: 0 Pending · 1 Home · 2 Draw · 3 Away.
- `opens_at` **is enforced** in `place_bet` (user decision): `require!(now >= opens_at)`.

## Key decisions

- **Solana, not EVM.** Solidity/Hardhat removed. `docs/SOLANA.md` supersedes README §12–14.
- **Admin/oracle/prize wallet:** `2n8wmUm5h2XhrK1c2QfsPQMHyLkHkMEsaPbfbTocrT68` (public address only; deploy uses the local devnet keypair; move authority to a wallet-controlled keypair/multisig for prod).
- **Simulation-only.** WCDT has no value; treasury is pre-seeded because fixed-odds payouts can exceed pooled stakes. Not a solvent real book.
- **Odds are caller-supplied** with only a `>= 1.0` floor — acceptable for the sim; the economic trust boundary to close before any real-money use.
- Team names beyond FRA-MAR are participant-ID placeholders (dataset only names fixture 18209181). Fill `packages/shared-types/src/fixtures.ts` when a real map is available.

## Dataset

6 World Cup fixtures at `data/exact-match-txline-raw-inspect/txline-raw/` (already tracked;
identical md5 to the Downloads bundle). Engine reads it via `TXLINE_DATA_DIR` (overridable),
defaulting to that path. Fixtures: 18209181 (FRA-MAR 2-0), 18213979 (1-2 ET), 18218149 (2-1),
18222446 (3-1 ET), 18237038 (0-2), 18241006 (1-2).

## no-mistakes gate (per user directive: gate throughout building)

- Repo is initialized (`no-mistakes init`). Push target = `YapHongSanHansen/WorldCupHackathon` (you have WRITE). Pipeline agent = `claude`.
- Workflow per verified chunk: feature branch → commit → `no-mistakes axi run --intent "..."` → respond to gates → `checks-passed`.
- **Current branch `foundation-replay-and-solana-program`:** review step found 3 findings — `opens-at-not-enforced` (fixed, enforced), `setspeed-while-paused-corrupts-clock` (fixed), `caller-supplied-odds-unbounded` (no-op, by design). The pipeline's fix-agent crashed once (infra), so fixes were applied by hand; **re-run the gate** after committing.

## Next steps (Phase 3)

1. ✅ **Agent core** (`packages/agent-core`) — DONE (commit `9ebae94`). `PressureEdgeV1`
   (spec §11.7): Poisson goal model from a Bayesian-shrunk recent-pressure share + scoreline
   vs de-vigged market implied probs, highest positive edge wins; mandatory SKIP gates (§11.5)
   incl. a 5' warmup; stake sizing (§11.6); recommendation state machine (§28) in shared-types.
   Domain types (`UserPreferences`, `AgentDecision`, `AgentContext`, `Selection`) live in
   `@wc/shared-types`. 42 vitest tests (unit + full replay-driven invariant run) green; `tsc`
   and `replay:verify` green. Entry: `import { pressureEdgeV1, DEFAULT_PREFERENCES } from "@wc/agent-core"`.
   Telegram bot token (Phase 4) stored in gitignored `.env.local` (`TELEGRAM_BOT_TOKEN`); see `.env.example`.
2. **API + oracle** (`apps/api`): Fastify + Socket.IO; drive replay → agent → recommendation state machine (spec §28); a **Solana oracle keypair** submits `resolve_market` on terminal state; `place_bet`/`claim` via the connected wallet.
3. **Web** (`apps/web`): Next.js + `@solana/wallet-adapter` (Phantom) — connect, faucet, match centre, `/confirm/[id]` signing, portfolio.
4. **Telegram** (Phase 4) and **portfolio/polish/tests** (Phase 5) follow.

Gate each phase through no-mistakes.
