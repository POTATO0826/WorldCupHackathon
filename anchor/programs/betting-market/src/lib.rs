use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, MintTo, Token, TokenAccount, Transfer},
};

declare_id!("2FTpj3gxeKv82Z8JKivPfajwcHLFeyZ5WpthzVyXSUgV");

// WCDT — simulation stake token. HAS NO MONETARY VALUE.
pub const WCDT_DECIMALS: u8 = 6;
pub const FAUCET_AMOUNT: u64 = 1_000 * 1_000_000; // 1,000 WCDT
pub const TREASURY_LIQUIDITY: u64 = 1_000_000 * 1_000_000; // 1M WCDT payout reserve
pub const BPS: u128 = 10_000;

pub const MAX_FIXTURE_LEN: usize = 16;
pub const MAX_LABEL_LEN: usize = 64;

// Outcome: 0 = Pending, 1 = Home, 2 = Draw, 3 = Away (mirrors spec §13.1).
pub const OUTCOME_PENDING: u8 = 0;
pub const OUTCOME_HOME: u8 = 1;
pub const OUTCOME_DRAW: u8 = 2;
pub const OUTCOME_AWAY: u8 = 3;

/**
 * World Cup Betting Agent — Solana port of the spec's BettingMarket (§13).
 *
 * Simulation-only 1X2 prediction markets. A program-owned Config PDA is the
 * authority for the WCDT mint and the treasury token account. Bet PDAs are
 * seeded by (market_id, bettor) so the runtime enforces "one bet per market
 * per wallet" for free. Fixed-odds payouts (§13.5) are paid from the treasury.
 */
#[program]
pub mod betting_market {
    use super::*;

    /// One-time setup: create Config, the WCDT mint, and a funded treasury.
    pub fn initialize(ctx: Context<Initialize>, oracle: Pubkey, faucet_cooldown: i64) -> Result<()> {
        let bump = ctx.bumps.config;
        {
            let config = &mut ctx.accounts.config;
            config.admin = ctx.accounts.admin.key();
            config.oracle = oracle;
            config.mint = ctx.accounts.mint.key();
            config.treasury = ctx.accounts.treasury.key();
            config.faucet_amount = FAUCET_AMOUNT;
            config.faucet_cooldown = faucet_cooldown;
            config.market_count = 0;
            config.bump = bump;
        }

        // Seed the treasury with payout liquidity (fixed-odds solvency, §13.5).
        // The &mut config borrow above is dropped before this CPI, which needs
        // an immutable borrow of config as the mint authority.
        let signer: &[&[&[u8]]] = &[&[b"config", &[bump]]];
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                    authority: ctx.accounts.config.to_account_info(),
                },
                signer,
            ),
            TREASURY_LIQUIDITY,
        )?;

        emit!(Initialized {
            admin: ctx.accounts.admin.key(),
            oracle,
            mint: ctx.accounts.mint.key(),
        });
        Ok(())
    }

    /// Claim 1,000 WCDT, rate-limited per wallet by the configured cooldown.
    pub fn faucet(ctx: Context<Faucet>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let rec = &mut ctx.accounts.faucet_record;
        require!(
            rec.last_claim == 0 || now - rec.last_claim >= ctx.accounts.config.faucet_cooldown,
            BetError::FaucetCooldown
        );
        rec.last_claim = now;
        rec.bump = ctx.bumps.faucet_record;

        let bump = ctx.accounts.config.bump;
        let amount = ctx.accounts.config.faucet_amount;
        let signer: &[&[&[u8]]] = &[&[b"config", &[bump]]];
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.user_token.to_account_info(),
                    authority: ctx.accounts.config.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;
        Ok(())
    }

    /// Operator (admin) opens a market for a fixture.
    pub fn create_market(
        ctx: Context<CreateMarket>,
        market_id: u64,
        fixture_id: String,
        label: String,
        opens_at: i64,
        closes_at: i64,
    ) -> Result<()> {
        require!(closes_at > opens_at, BetError::BadWindow);
        require!(fixture_id.len() <= MAX_FIXTURE_LEN, BetError::StringTooLong);
        require!(label.len() <= MAX_LABEL_LEN, BetError::StringTooLong);

        let m = &mut ctx.accounts.market;
        m.id = market_id;
        m.fixture_id = fixture_id.clone();
        m.label = label;
        m.opens_at = opens_at;
        m.closes_at = closes_at;
        m.closed = false;
        m.resolved = false;
        m.result = OUTCOME_PENDING;
        m.total_home = 0;
        m.total_draw = 0;
        m.total_away = 0;
        m.bump = ctx.bumps.market;

        let config = &mut ctx.accounts.config;
        if market_id >= config.market_count {
            config.market_count = market_id + 1;
        }

        emit!(MarketCreated { market_id, fixture_id });
        Ok(())
    }

    /// Operator (admin) prevents new bets on a market.
    pub fn close_market(ctx: Context<CloseMarket>, _market_id: u64) -> Result<()> {
        let m = &mut ctx.accounts.market;
        require!(!m.closed, BetError::AlreadyClosed);
        m.closed = true;
        emit!(MarketClosed { market_id: m.id });
        Ok(())
    }

    /// User places a single 1X2 bet, escrowing `stake` WCDT into the treasury.
    pub fn place_bet(
        ctx: Context<PlaceBet>,
        market_id: u64,
        selection: u8,
        stake: u64,
        odds_bps: u64,
    ) -> Result<()> {
        require!(
            selection == OUTCOME_HOME || selection == OUTCOME_DRAW || selection == OUTCOME_AWAY,
            BetError::BadSelection
        );
        require!(stake > 0, BetError::ZeroStake);
        require!(odds_bps as u128 >= BPS, BetError::OddsTooLow);

        let now = Clock::get()?.unix_timestamp;
        let m = &mut ctx.accounts.market;
        require!(!m.closed && !m.resolved, BetError::MarketNotOpen);
        require!(now <= m.closes_at, BetError::PastCloseTime);

        // Escrow stake: bettor -> treasury.
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                    authority: ctx.accounts.bettor.to_account_info(),
                },
            ),
            stake,
        )?;

        let payout = (stake as u128 * odds_bps as u128 / BPS) as u64;
        let bet = &mut ctx.accounts.bet;
        bet.market_id = market_id;
        bet.bettor = ctx.accounts.bettor.key();
        bet.selection = selection;
        bet.stake = stake;
        bet.odds_bps = odds_bps;
        bet.potential_payout = payout;
        bet.claimed = false;
        bet.placed_at = now;
        bet.bump = ctx.bumps.bet;

        match selection {
            OUTCOME_HOME => m.total_home = m.total_home.saturating_add(stake),
            OUTCOME_DRAW => m.total_draw = m.total_draw.saturating_add(stake),
            _ => m.total_away = m.total_away.saturating_add(stake),
        }

        emit!(BetPlaced {
            market_id,
            bettor: bet.bettor,
            selection,
            stake,
        });
        Ok(())
    }

    /// Oracle-only settlement from the replayed final score.
    pub fn resolve_market(ctx: Context<ResolveMarket>, _market_id: u64, result: u8) -> Result<()> {
        require!(
            result == OUTCOME_HOME || result == OUTCOME_DRAW || result == OUTCOME_AWAY,
            BetError::BadResult
        );
        let m = &mut ctx.accounts.market;
        require!(!m.resolved, BetError::AlreadyResolved);
        m.resolved = true;
        m.closed = true;
        m.result = result;
        emit!(MarketResolved { market_id: m.id, result });
        Ok(())
    }

    /// Winner claims fixed-odds payout from the treasury (once).
    pub fn claim_winnings(ctx: Context<ClaimWinnings>, _market_id: u64) -> Result<()> {
        let m = &ctx.accounts.market;
        require!(m.resolved, BetError::NotResolved);

        let bet = &mut ctx.accounts.bet;
        require!(!bet.claimed, BetError::AlreadyClaimed);
        require!(bet.selection == m.result, BetError::LosingBet);
        bet.claimed = true;

        let bump = ctx.accounts.config.bump;
        let signer: &[&[&[u8]]] = &[&[b"config", &[bump]]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.treasury.to_account_info(),
                    to: ctx.accounts.user_token.to_account_info(),
                    authority: ctx.accounts.config.to_account_info(),
                },
                signer,
            ),
            bet.potential_payout,
        )?;

        emit!(WinningsClaimed {
            market_id: bet.market_id,
            bettor: bet.bettor,
            payout: bet.potential_payout,
        });
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = admin,
        seeds = [b"mint"],
        bump,
        mint::decimals = WCDT_DECIMALS,
        mint::authority = config,
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = admin,
        associated_token::mint = mint,
        associated_token::authority = config,
    )]
    pub treasury: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Faucet<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(mut, address = config.mint)]
    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint,
        associated_token::authority = user,
    )]
    pub user_token: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + FaucetRecord::INIT_SPACE,
        seeds = [b"faucet", user.key().as_ref()],
        bump
    )]
    pub faucet_record: Account<'info, FaucetRecord>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(market_id: u64)]
pub struct CreateMarket<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = admin)]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + Market::INIT_SPACE,
        seeds = [b"market", market_id.to_le_bytes().as_ref()],
        bump
    )]
    pub market: Account<'info, Market>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(market_id: u64)]
pub struct CloseMarket<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = admin)]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,

    #[account(mut, seeds = [b"market", market_id.to_le_bytes().as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,
}

#[derive(Accounts)]
#[instruction(market_id: u64)]
pub struct PlaceBet<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(mut, seeds = [b"market", market_id.to_le_bytes().as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,

    #[account(mut)]
    pub bettor: Signer<'info>,

    #[account(
        init,
        payer = bettor,
        space = 8 + Bet::INIT_SPACE,
        seeds = [b"bet", market_id.to_le_bytes().as_ref(), bettor.key().as_ref()],
        bump
    )]
    pub bet: Account<'info, Bet>,

    #[account(address = config.mint)]
    pub mint: Account<'info, Mint>,

    #[account(mut, associated_token::mint = mint, associated_token::authority = bettor)]
    pub user_token: Account<'info, TokenAccount>,

    #[account(mut, address = config.treasury)]
    pub treasury: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(market_id: u64)]
pub struct ResolveMarket<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = oracle)]
    pub config: Account<'info, Config>,
    pub oracle: Signer<'info>,

    #[account(mut, seeds = [b"market", market_id.to_le_bytes().as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,
}

#[derive(Accounts)]
#[instruction(market_id: u64)]
pub struct ClaimWinnings<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(seeds = [b"market", market_id.to_le_bytes().as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,

    #[account(mut)]
    pub bettor: Signer<'info>,

    #[account(
        mut,
        seeds = [b"bet", market_id.to_le_bytes().as_ref(), bettor.key().as_ref()],
        bump = bet.bump,
        has_one = bettor
    )]
    pub bet: Account<'info, Bet>,

    #[account(address = config.mint)]
    pub mint: Account<'info, Mint>,

    #[account(mut, associated_token::mint = mint, associated_token::authority = bettor)]
    pub user_token: Account<'info, TokenAccount>,

    #[account(mut, address = config.treasury)]
    pub treasury: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub oracle: Pubkey,
    pub mint: Pubkey,
    pub treasury: Pubkey,
    pub faucet_amount: u64,
    pub faucet_cooldown: i64,
    pub market_count: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub id: u64,
    #[max_len(MAX_FIXTURE_LEN)]
    pub fixture_id: String,
    #[max_len(MAX_LABEL_LEN)]
    pub label: String,
    pub opens_at: i64,
    pub closes_at: i64,
    pub closed: bool,
    pub resolved: bool,
    pub result: u8,
    pub total_home: u64,
    pub total_draw: u64,
    pub total_away: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Bet {
    pub market_id: u64,
    pub bettor: Pubkey,
    pub selection: u8,
    pub stake: u64,
    pub odds_bps: u64,
    pub potential_payout: u64,
    pub claimed: bool,
    pub placed_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct FaucetRecord {
    pub last_claim: i64,
    pub bump: u8,
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[event]
pub struct Initialized {
    pub admin: Pubkey,
    pub oracle: Pubkey,
    pub mint: Pubkey,
}

#[event]
pub struct MarketCreated {
    pub market_id: u64,
    pub fixture_id: String,
}

#[event]
pub struct MarketClosed {
    pub market_id: u64,
}

#[event]
pub struct BetPlaced {
    pub market_id: u64,
    pub bettor: Pubkey,
    pub selection: u8,
    pub stake: u64,
}

#[event]
pub struct MarketResolved {
    pub market_id: u64,
    pub result: u8,
}

#[event]
pub struct WinningsClaimed {
    pub market_id: u64,
    pub bettor: Pubkey,
    pub payout: u64,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[error_code]
pub enum BetError {
    #[msg("faucet cooldown active")]
    FaucetCooldown,
    #[msg("close time must be after open time")]
    BadWindow,
    #[msg("string exceeds max length")]
    StringTooLong,
    #[msg("selection must be Home/Draw/Away")]
    BadSelection,
    #[msg("stake must be > 0")]
    ZeroStake,
    #[msg("odds must be >= 1.0 (10000 bps)")]
    OddsTooLow,
    #[msg("market is not open")]
    MarketNotOpen,
    #[msg("past market close time")]
    PastCloseTime,
    #[msg("market already closed")]
    AlreadyClosed,
    #[msg("result must be Home/Draw/Away")]
    BadResult,
    #[msg("market already resolved")]
    AlreadyResolved,
    #[msg("market not resolved yet")]
    NotResolved,
    #[msg("bet did not win")]
    LosingBet,
    #[msg("winnings already claimed")]
    AlreadyClaimed,
}
