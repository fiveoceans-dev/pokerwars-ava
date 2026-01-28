# Vanilla Blockchain Ledger (DB-Backed)

This document defines a DB-backed “vanilla blockchain” model for PokerWars. The goal is a single, auditable ledger for **all economic activity** (coins, tickets, buy‑ins, refunds, prizes) with a treasury that tracks total supply and issuance, while still operating in a traditional database.

The intent is to make the system behave like a functional blockchain: immutable transaction history, deterministic balances, and verifiable flows from buy‑in to payout.

---

## Objectives

- **Single source of truth** for balances and transfers.
- **Immutable ledger** for all economic activity.
- **Deterministic accounting** with full auditability.
- **Treasury‑controlled issuance** of coins and tickets.
- **Tournament escrow**: buy‑ins are deposited into a tournament “vault” and distributed on payout.

---

## Core Tables

### 0) `users`
Wallet and email identities for an account.

**Columns**
- `id` (uuid / cuid)
- `wallet_address` (unique, nullable)
- `email` (unique, nullable)
- `created_at`
- `updated_at`

### 1) `ledger_transactions`
Immutable record of all balance‑affecting events.

**Columns**
- `id` (uuid / cuid)
- `seq` (int, strictly increasing)
- `prev_hash` (string, nullable)
- `hash` (string, sha256)
- `created_at` (timestamp)
- `type` (enum)
- `from_account_id` (nullable)
- `to_account_id` (nullable)
- `asset` (enum: COINS, TICKET_X, TICKET_Y, TICKET_Z)
- `amount` (int, >0)
- `reference_type` (enum: TOURNAMENT, USER, TREASURY)
- `reference_id` (string)
- `metadata` (json)

**Recommended `type` values**
- `MINT` (treasury → user)
- `BURN` (user → treasury)
- `TRANSFER` (user ↔ user)
- `BUY_IN` (user → tournament escrow)
- `REFUND` (tournament escrow → user)
- `PAYOUT` (tournament escrow → user)
- `CONVERT_BUY` (user coins → tickets)
- `CONVERT_SELL` (user tickets → coins)
- `CLAIM_FREE` (treasury → user)

> Ledger entries are **append‑only**. Never update or delete.

---

### 2) `accounts`
All internal balances are derived from this table, but **account rows are mutable** as a cache for fast reads.

**Columns**
- `id` (uuid / cuid)
- `owner_type` (enum: USER, TREASURY, TOURNAMENT)
- `owner_id` (string)
- `coins` (int)
- `ticket_x` (int)
- `ticket_y` (int)
- `ticket_z` (int)
- `created_at`
- `updated_at`

**Rules**
- Only `ledger_transactions` should mutate balances.
- Balances can be recomputed from ledger if needed.

---

### 3) `treasury`
Single row tracking issued supply and ticket counts.

**Columns**
- `id` (fixed: `TREASURY`)
- `coin_supply_total` (bigint) **initial = 5,000,000,000**
- `coin_supply_remaining` (bigint)
- `ticket_x_issued` (int)
- `ticket_y_issued` (int)
- `ticket_z_issued` (int)
- `created_at`
- `updated_at`

**Rules**
- Minting reduces `coin_supply_remaining`.
- Ticket issuance increments ticket_x/y/z counts.
- Treasury is the **origin** of all supply.

---

### 4) `tournament_escrow`
Escrow account per tournament for buy‑ins.

**Columns**
- `tournament_id` (PK)
- `account_id` (FK to `accounts`)
- `created_at`
- `updated_at`

**Rules**
- All buy‑ins deposit into escrow.
- Payouts are distributed from escrow.
- Refunds return from escrow to users.

---

## Workflows (Ledger First)

### A) Free Claim (Coins)
1. Treasury mints 500 coins to user.
2. Ledger entry: `CLAIM_FREE` (TREASURY → USER).
3. Account balances updated by projection.

### B) Buy Ticket (Coins → Ticket)
1. User transfers coins to Treasury (or protocol market account).
2. Treasury issues ticket_x/y/z.
3. Ledger entries:
   - `CONVERT_BUY` (USER → TREASURY, COINS)
   - `CONVERT_BUY` (TREASURY → USER, TICKET_X/Y/Z)

### C) Sell Ticket (Ticket → Coins)
1. User sends ticket to Treasury.
2. Treasury sends coins back to user.
3. Ledger entries:
   - `CONVERT_SELL` (USER → TREASURY, TICKET_X/Y/Z)
   - `CONVERT_SELL` (TREASURY → USER, COINS)

### D) Buy‑in (S&G or MTT)
1. User pays buy‑in to **tournament escrow account**.
2. Ledger entry: `BUY_IN` (USER → TOURNAMENT_ESCROW).
3. Tournament escrow holds total pool.

### E) Refund
1. Refund from escrow to user.
2. Ledger entry: `REFUND` (TOURNAMENT_ESCROW → USER).

### F) Payouts
1. Escrow distributes payouts to winners.
2. Ledger entries: `PAYOUT` (TOURNAMENT_ESCROW → USER) per winner.

---

## Ledger Integrity

To mimic blockchain behavior:

- **Append‑only transactions**
- **Deterministic ordering**: `seq`
- **Hash chaining**:
  - `hash = sha256(prev_hash + payload)`
  - Enables audit trail and tamper detection.

---

## Plan (Implementation)

### Phase 1 — Schema + Core Services
1. Add DB tables: `accounts`, `ledger_transactions`, `treasury`, `tournament_escrow`.
2. Add ledger service with atomic transaction API:
   - `createLedgerEntry(...)`
   - `applyTransfer(from, to, asset, amount, type)`
3. Add treasury init script (coin supply 5B).

### Phase 2 — Balance Source of Truth
1. Replace local balances with `accounts` + ledger.
2. Add endpoints:
   - `GET /api/user/balance?wallet=...`
   - `GET /api/user/profile?wallet=...`
   - `GET /api/user/ledger?wallet=...`
   - `POST /api/user/claim`
   - `POST /api/user/convert`
   - `POST /api/user/email`

### Phase 3 — Tournament Escrow
1. On registration, buy‑ins move to tournament escrow.
2. On cancellation, refunds from escrow.
3. On finish, payouts from escrow → winners.

### Phase 4 — Reconciliation
1. Add nightly reconciliation:
   - recompute balances from ledger
   - compare with `accounts` table
   - alert on mismatches.

---

## Notes

- The ledger table is the **blockchain substitute**.
- The treasury is the **origin** of all supply.
- Every economic event must go through **ledger + escrow**.
- The account balances are a **cache**, not the source of truth.
- Treasury coin supply is synchronized from the treasury account balance after COINS transfers.
