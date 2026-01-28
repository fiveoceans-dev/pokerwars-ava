
# PokerWars Foundry Workspace

This directory contains the on-chain pieces of PokerWars, built with [Foundry](https://book.getfoundry.sh/).

## Prerequisites
- Install Foundry: `curl -L https://foundry.paradigm.xyz | bash`
- Install dependencies: `forge install`

## Usage
```bash
# build & test
forge build
forge test

# deploy to Hyperliquid (requires PRIVATE_KEY & HYPERLIQUID_RPC_URL env vars)
forge script script/Deploy.s.sol --rpc-url $HYPERLIQUID_RPC_URL \
  --broadcast --verify
```

## Layout
```
contracts/
├── foundry.toml          # Foundry configuration
├── src/                  # Solidity contracts
│   └── HyperPoker.sol    # Table registry placeholder
├── script/               # Deployment scripts
│   └── Deploy.s.sol
├── test/                 # Solidity unit tests
│   └── HyperPoker.t.sol
└── lib/                  # External dependencies (forge install)
```

Populate `.env` (or export variables) with:

```
PRIVATE_KEY=0x...
HYPERLIQUID_RPC_URL=https://...
HYPERLIQUID_EXPLORER_API_KEY=...
```

This workspace is intentionally light-weight; add additional contracts and tests as you migrate gameplay logic on-chain.
