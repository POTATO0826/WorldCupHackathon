# Solana Chain Layer — authoritative spec

> **This document supersedes the EVM/Hardhat/MetaMask chain sections of `README.md`
> (§8 Chain subgraph, §12 Web3 architecture, §13 smart-contract design, §14 mock-oracle,
> and the Appendix B chain env vars).** Everything else in `README.md` — the TxLINE replay
> engine (§9–§10), the rule-based agent (§11), Telegram (§15), the database (§17), and the
> product flow — is chain-agnostic and remains valid as written.

The project is built on **Solana** (hackathon requirement). The Solidity/ERC-20 design was
ported 1:1 to an **Anchor program** and an **SPL token**.

## EVM → Solana mapping

| README (EVM) | This project (Solana) |
|---|---|
| MetaMask | Solana wallet-adapter (Phantom / Solflare / Backpack) |
| Hardhat local EVM | `solana-test-validator` / devnet |
| Wagmi + Viem | `@solana/web3.js` + `@coral-xyz/anchor` |
| `WorldCupDemoToken` ERC-20 (WCDT) | SPL mint (WCDT), authority = program Config PDA |
| `BettingMarket.sol` | Anchor program `betting_market` (`anchor/programs/betting-market`) |
| Solidity `enum Outcome` | `u8`: 0 Pending · 1 Home · 2 Draw · 3 Away |
| `struct Market` / `struct Bet` | `Market` / `Bet` account PDAs |
| `mapping` storage | PDA accounts seeded deterministically |
| AccessControl roles | `has_one` checks against `Config.admin` / `Config.oracle` |
| ReentrancyGuard / Pausable | Solana's single-threaded runtime + program checks |
| `ORACLE_PRIVATE_KEY` (EOA) | Oracle **keypair** (server-held) matching `Config.oracle` |

## Program: `betting_market`

Program id: managed by `anchor keys sync` (see `Anchor.toml` / `declare_id!`).
WCDT decimals = 6. Simulation-only; WCDT has no monetary value.

### PDAs

| Account | Seeds | Purpose |
|---|---|---|
| `Config` | `["config"]` | admin, oracle, mint, treasury, faucet params, market_count |
| WCDT `Mint` | `["mint"]` | program-owned SPL mint (Config is mint authority) |
| `treasury` | ATA(mint, Config) | escrow + fixed-odds payout reserve |
| `Market` | `["market", market_id_le_u64]` | one per fixture market |
| `Bet` | `["bet", market_id_le_u64, bettor]` | **PDA uniqueness = one bet per market per wallet** |
| `FaucetRecord` | `["faucet", user]` | per-wallet faucet cooldown |

### Instructions

| Instruction | Signer | Effect |
|---|---|---|
| `initialize(oracle, faucet_cooldown)` | admin | Create Config + WCDT mint + funded treasury |
| `faucet()` | user | Mint 1,000 WCDT, rate-limited by cooldown |
| `create_market(market_id, fixture_id, label, opens_at, closes_at)` | admin | Open a market |
| `close_market(market_id)` | admin | Stop new bets |
| `place_bet(market_id, selection, stake, odds_bps)` | user | Escrow stake → treasury, record Bet |
| `resolve_market(market_id, result)` | **oracle** | Settle from replayed final score |
| `claim_winnings(market_id)` | user | Pay `stake * odds_bps / 1e4` from treasury if won |

Payout model (mirrors README §13.5): fixed-odds, `potentialPayout = stake * oddsBps / 10000`.
Losing stakes stay in the treasury; the treasury is pre-seeded with WCDT liquidity at
`initialize` so winners can always claim.

## Authority wallet

Intended admin / oracle / prize wallet: `2n8wmUm5h2XhrK1c2QfsPQMHyLkHkMEsaPbfbTocrT68`.
This is a **public address only**; on-chain deployment and the mock-oracle signer use a local
devnet keypair. On mainnet/prod the admin+oracle authorities would be transferred to a keypair
this wallet controls (or a multisig).

## Mock oracle (supersedes §14)

The replay engine detects the terminal state, maps the final score to `1|2|3`
(Home/Draw/Away), and the server's **oracle keypair** submits `resolve_market(market_id, result)`.
Non-oracle callers are rejected by the `has_one = oracle` constraint on `Config`.

## Env vars (supersedes Appendix B chain rows)

```text
SOLANA_RPC_URL=            # e.g. https://api.devnet.solana.com or a Helius devnet URL
SOLANA_CLUSTER=devnet
PROGRAM_ID=               # betting_market program id (from anchor keys sync)
WCDT_MINT=                # SPL mint PDA (derive: ["mint"])
CONFIG_PDA=              # derive: ["config"]
ORACLE_KEYPAIR_PATH=      # server-held keypair matching Config.oracle
```

## Build / test / deploy

```bash
cd anchor
anchor build            # compile the program (BPF)
anchor keys sync        # write the real program id into declare_id! + Anchor.toml
anchor test             # spins up a local validator and runs tests/betting-market.ts
# devnet:
solana config set --url devnet && solana airdrop 2
anchor deploy --provider.cluster devnet
```
