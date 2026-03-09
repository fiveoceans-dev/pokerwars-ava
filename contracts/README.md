# Smart Contracts — Avalanche

Solidity smart contracts for PokerWars, built with Hardhat and targeting the Avalanche C-Chain.

## Structure

```
contracts/
├── contracts/          # Solidity source files
│   └── PokerTable.sol  # Core poker table contract
├── scripts/            # Deployment scripts
│   └── deploy.ts
├── test/               # Contract tests
│   └── PokerTable.test.ts
├── hardhat.config.ts   # Hardhat configuration (Avalanche Fuji + Mainnet)
├── package.json
├── tsconfig.json
└── .env.example
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
npx hardhat run scripts/deploy.ts --network fuji

# Deploy to Avalanche mainnet
npx hardhat run scripts/deploy.ts --network avalanche
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
