/**
 * Real Solana chain gateway — signs against the deployed `betting_market`
 * program (docs/SOLANA.md) through the same `ChainGateway` interface the mock
 * implements, so the orchestrator is unchanged.
 *
 * Role keypairs are server-held (this is a simulation): `admin` opens markets,
 * `oracle` resolves them from the replayed final score, and a single `bettor`
 * keypair places/claims on behalf of the sim wallet. In a real product the
 * bettor's Phantom would sign `place_bet`/`claim` from the browser instead.
 *
 * NOTE: implemented against the program interface + IDL but NOT yet verified on
 * a live validator in this environment (no Solana toolchain on PATH). Wire it in
 * behind CHAIN=solana once the program is deployed and roles are funded.
 */

import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  type Commitment,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { readFileSync } from "node:fs";
import { Outcome, SELECTION_TO_OUTCOME } from "@wc/shared-types";
import idlJson from "./idl/betting_market.json" with { type: "json" };
import type { BettingMarket } from "./idl/betting_market.js";
import {
  oddsToBps,
  payoutWcdt,
  type ChainGateway,
  type ClaimResult,
  type EnsureMarketParams,
  type MarketRef,
  type PlaceBetParams,
  type PlaceBetResult,
  type ResolveResult,
} from "./gateway.js";

const WCDT_DECIMALS = 6;
const BASE = 10 ** WCDT_DECIMALS;
const le8 = (n: number): Buffer => new BN(n).toArrayLike(Buffer, "le", 8);

export interface SolanaChainGatewayOptions {
  connection: Connection;
  admin: Keypair;
  oracle: Keypair;
  bettor: Keypair;
  commitment?: Commitment;
}

export class SolanaChainGateway implements ChainGateway {
  readonly kind = "solana" as const;

  private readonly connection: Connection;
  private readonly admin: Keypair;
  private readonly oracle: Keypair;
  private readonly bettor: Keypair;
  private readonly programId: PublicKey;
  private readonly config: PublicKey;
  private readonly mint: PublicKey;
  private readonly treasury: PublicKey;

  constructor(opts: SolanaChainGatewayOptions) {
    this.connection = opts.connection;
    this.admin = opts.admin;
    this.oracle = opts.oracle;
    this.bettor = opts.bettor;
    this.programId = new PublicKey((idlJson as { address: string }).address);
    [this.config] = PublicKey.findProgramAddressSync([Buffer.from("config")], this.programId);
    [this.mint] = PublicKey.findProgramAddressSync([Buffer.from("mint")], this.programId);
    this.treasury = getAssociatedTokenAddressSync(this.mint, this.config, true);
  }

  /** Load role keypairs from files (paths from env) and build the gateway. */
  static fromEnv(): SolanaChainGateway {
    const rpc = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
    const commitment: Commitment = "confirmed";
    const connection = new Connection(rpc, commitment);
    const oracle = loadKeypair(requireEnv("ORACLE_KEYPAIR_PATH"));
    const admin = process.env.ADMIN_KEYPAIR_PATH ? loadKeypair(process.env.ADMIN_KEYPAIR_PATH) : oracle;
    const bettor = process.env.BETTOR_KEYPAIR_PATH ? loadKeypair(process.env.BETTOR_KEYPAIR_PATH) : oracle;
    return new SolanaChainGateway({ connection, admin, oracle, bettor, commitment });
  }

  private program(payer: Keypair): Program<BettingMarket> {
    const provider = new AnchorProvider(this.connection, new Wallet(payer), {
      commitment: "confirmed",
    });
    // Anchor 0.30+: programId is read from idl.address.
    return new Program(idlJson as unknown as BettingMarket, provider);
  }

  private marketPda(marketId: number): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), le8(marketId)],
      this.programId,
    );
    return pda;
  }

  private betPda(marketId: number, bettor: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("bet"), le8(marketId), bettor.toBuffer()],
      this.programId,
    );
    return pda;
  }

  async ensureMarket(params: EnsureMarketParams): Promise<MarketRef> {
    // Deterministic market id from the numeric fixture id (idempotent PDA).
    const marketId = Number(params.fixtureId);
    const marketPda = this.marketPda(marketId);
    const program = this.program(this.admin);

    const existing = await program.account.market.fetchNullable(marketPda);
    if (existing) return { marketId, marketPda: marketPda.toBase58() };

    await program.methods
      .createMarket(
        new BN(marketId),
        params.fixtureId,
        params.label.slice(0, 64),
        new BN(Math.floor(params.opensAt / 1000)),
        new BN(Math.floor(params.closesAt / 1000)),
      )
      .accountsPartial({
        config: this.config,
        admin: this.admin.publicKey,
        market: marketPda,
      })
      .rpc();

    return { marketId, marketPda: marketPda.toBase58() };
  }

  async placeBet(params: PlaceBetParams): Promise<PlaceBetResult> {
    const program = this.program(this.bettor);
    const marketPda = this.marketPda(params.marketId);
    const betPda = this.betPda(params.marketId, this.bettor.publicKey);
    const userToken = getAssociatedTokenAddressSync(this.mint, this.bettor.publicKey);

    const signature = await program.methods
      .placeBet(
        new BN(params.marketId),
        SELECTION_TO_OUTCOME[params.selection],
        new BN(params.stakeWcdt * BASE),
        new BN(params.oddsBps),
      )
      .accountsPartial({
        config: this.config,
        market: marketPda,
        bettor: this.bettor.publicKey,
        bet: betPda,
        mint: this.mint,
        userToken,
        treasury: this.treasury,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    return { signature, betPda: betPda.toBase58() };
  }

  async resolveMarket(marketId: number, result: Outcome): Promise<ResolveResult> {
    if (result === Outcome.Pending) throw new Error("cannot resolve to Pending");
    const program = this.program(this.oracle);
    const signature = await program.methods
      .resolveMarket(new BN(marketId), result)
      .accountsPartial({
        config: this.config,
        oracle: this.oracle.publicKey,
        market: this.marketPda(marketId),
      })
      .rpc();
    return { signature };
  }

  async claimWinnings(marketId: number): Promise<ClaimResult> {
    const program = this.program(this.bettor);
    const betPda = this.betPda(marketId, this.bettor.publicKey);
    const userToken = getAssociatedTokenAddressSync(this.mint, this.bettor.publicKey);

    const bet = await program.account.bet.fetchNullable(betPda);

    const signature = await program.methods
      .claimWinnings(new BN(marketId))
      .accountsPartial({
        config: this.config,
        market: this.marketPda(marketId),
        bettor: this.bettor.publicKey,
        bet: betPda,
        mint: this.mint,
        userToken,
        treasury: this.treasury,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const payout = bet ? bet.potentialPayout.toNumber() / BASE : 0;
    return { signature, payoutWcdt: payout };
  }
}

function loadKeypair(path: string): Keypair {
  const secret = JSON.parse(readFileSync(path, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name} (required for CHAIN=solana)`);
  return v;
}

export { oddsToBps, payoutWcdt };
