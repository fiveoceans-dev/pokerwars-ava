# Smart Contracts (Avalanche)

Hardhat workspace for the on‑chain pieces of PokerWars. Targets Avalanche C-Chain (mainnet + Fuji).

## Key Contracts

- **BankEscrow.sol** — Simple deposits/withdrawals for buy-ins and prize payouts. Holds approved ERC20s, lets admins pull payouts singly or batched. Ideal for cash/SNG/MTT escrow.
- **RakeCollector.sol** — Pulls rake/jackpot from tables and immediately forwards splits (BPS-configurable) to separate sinks (treasury + jackpot vault).
- **RakeJackpotVault.sol** — Minimal vault that can hold rake or jackpot balances; owner can withdraw to treasury/prize pool. Use as the sinks for RakeCollector.
- **PokerEscrow.sol** — Holds the game token escrow; admins can mint (when token ownership is delegated) and send tokens for rewards/ops.
- **PokerToken.sol** — 5B-capped ERC20 ($POKER) with owner-controlled minting.
- **PokerTable.sol** — Minimal ETH-based table with seat/leave and manual pot settlement (owner-driven).
- **PokerRNG.sol** — Pseudo-RNG (blockhash/prevrandao) for MVP/testing. Replace with VRF for production.
- **PokerGameMVP.sol** — Tiny dealer that uses PokerRNG to emit a 5‑card board; stores last hands on-chain for demos.

## Structure

```
contracts/
├── src/                # Solidity sources listed above
├── script/             # Deployment scripts
├── test/               # Contract tests
├── hardhat.config.ts   # Hardhat config (Avalanche + Fuji)
├── package.json
└── tsconfig.json
```

## Quick Start

```bash
cd contracts
npm install

# Compile
npx hardhat compile

# Test
npx hardhat test

# Deploy to Avalanche Fuji testnet
npx hardhat run script/deploy.ts --network fuji

# Deploy to Avalanche mainnet
npx hardhat run script/deploy.ts --network avalanche
```

## Networks

| Network           | Chain ID | RPC                                      |
| ----------------- | -------- | ---------------------------------------- |
| Avalanche Mainnet | 43114    | https://api.avax.network/ext/bc/C/rpc    |
| Avalanche Fuji    | 43113    | https://api.avax-test.network/ext/bc/C/rpc |

## Environment Variables

Copy `.env.example` to `.env` and fill in:

- `DEPLOYER_PRIVATE_KEY` — Private key for deployments
- `SNOWTRACE_API_KEY` — For contract verification on Snowtrace

## Usage Notes

- Escrow contracts are admin-gated for payouts; plug in your orchestrator/WS service to call `deposit`, `payout`, and `batchPayout`.
- Rake flow: table contract calls `RakeCollector.contribute(token, amount, gameType, gameId)`; the collector pulls from the table and forwards to `rakeSink` and `jackpotSink` (commonly `RakeJackpotVault` instances). BPS capped at 20% per stream.
- PokerRNG/PokerGameMVP are not production-safe randomness; swap to Chainlink VRF before handling real-value games.
