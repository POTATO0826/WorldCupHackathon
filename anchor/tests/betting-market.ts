import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";
import { BettingMarket } from "../target/types/betting_market";

const OUT = { Home: 1, Draw: 2, Away: 3 };

function le8(n: number): Buffer {
  return new BN(n).toArrayLike(Buffer, "le", 8);
}

describe("betting-market", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.bettingMarket as Program<BettingMarket>;
  const admin = provider.wallet as anchor.Wallet;

  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
  const [mint] = PublicKey.findProgramAddressSync([Buffer.from("mint")], program.programId);
  const treasury = getAssociatedTokenAddressSync(mint, config, true);

  it("initializes config, mint, and funded treasury", async () => {
    await program.methods
      .initialize(admin.publicKey, new BN(60)) // oracle = admin, 60s cooldown
      .accounts({
        admin: admin.publicKey,
        mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const cfg = await program.account.config.fetch(config);
    assert.ok(cfg.mint.equals(mint));
    assert.ok(cfg.oracle.equals(admin.publicKey));
  });

  it("faucet mints 1,000 WCDT", async () => {
    const userToken = getAssociatedTokenAddressSync(mint, admin.publicKey);
    await program.methods
      .faucet()
      .accounts({
        mint,
        user: admin.publicKey,
        userToken,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const bal = await provider.connection.getTokenAccountBalance(userToken);
    assert.equal(bal.value.uiAmount, 1000);
  });

  it("runs create -> bet -> resolve -> claim (win pays 1.75x)", async () => {
    const marketId = 1;
    const [market] = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), le8(marketId)],
      program.programId,
    );
    const now = Math.floor(Date.now() / 1000);

    await program.methods
      .createMarket(new BN(marketId), "18209181", "France v Morocco", new BN(now), new BN(now + 3600))
      .accounts({ admin: admin.publicKey, market, systemProgram: anchor.web3.SystemProgram.programId })
      .rpc();

    const userToken = getAssociatedTokenAddressSync(mint, admin.publicKey);
    const [bet] = PublicKey.findProgramAddressSync(
      [Buffer.from("bet"), le8(marketId), admin.publicKey.toBuffer()],
      program.programId,
    );
    const stake = new BN(20_000_000); // 20 WCDT

    await program.methods
      .placeBet(new BN(marketId), OUT.Home, stake, new BN(17_500)) // 1.75x
      .accounts({
        market,
        bettor: admin.publicKey,
        bet,
        mint,
        userToken,
        treasury,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .resolveMarket(new BN(marketId), OUT.Home)
      .accounts({ oracle: admin.publicKey, market })
      .rpc();

    const before = (await provider.connection.getTokenAccountBalance(userToken)).value.amount;
    await program.methods
      .claimWinnings(new BN(marketId))
      .accounts({
        market,
        bettor: admin.publicKey,
        bet,
        mint,
        userToken,
        treasury,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    const after = (await provider.connection.getTokenAccountBalance(userToken)).value.amount;

    // payout = 20 * 1.75 = 35 WCDT
    assert.equal(Number(after) - Number(before), 35_000_000);
  });
});
