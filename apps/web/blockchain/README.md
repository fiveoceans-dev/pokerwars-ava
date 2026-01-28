# Blockchain Integration Layer

This directory contains the future blockchain smart contract integration layer for PokerWars.

## 🚧 Status: Future Development

**Current State**: Placeholder directory for future blockchain integration  
**Current Game Logic**: Located in `../game-engine/` (pure TypeScript)

## 🎯 Migration Strategy

This module will eventually replace the TypeScript game logic in `../game-engine/` with smart contract calls on the Hyperliquid testnet.

### Phase 1: Interface Layer (Planned)
```typescript
// blockchain/gameEngine.ts - Future implementation
import { GameEngine as IGameEngine } from '../game-engine';
import { PokerContract } from './contracts';

export class BlockchainGameEngine implements IGameEngine {
  private contract: PokerContract;
  
  constructor(contractAddress: string) {
    this.contract = new PokerContract(contractAddress);
  }
  
  async startHand(): Promise<void> {
    await this.contract.invoke('start_hand', []);
  }
  
  async handleAction(playerId: string, action: Action): Promise<void> {
    await this.contract.invoke('player_action', [playerId, action]);
  }
}
```

### Phase 2: Selective Integration (Planned)
Replace security-critical components first:
- **Hand Evaluation**: Provable on-chain evaluation
- **Random Number Generation**: VRF-based card dealing
- **Final Payouts**: Smart contract pot distribution

### Phase 3: Full Migration (Future)
- Complete on-chain game state
- Mental poker card secrecy protocols
- Zero-knowledge hand verification

## 🔗 Smart Contract Integration

### Contract Locations
Smart contracts now live in the new Foundry workspace at `../../contracts`. The default profile targets the Hyperliquid testnet; update
`foundry.toml` with production RPC/keys when you deploy to mainnet.

### Planned Contract Interfaces (Solidity)
```solidity
// contracts/src/HyperPoker.sol
pragma solidity ^0.8.24;

interface IHyperPokerTable {
    function startHand(uint256 tableId) external;
    function playerAction(uint256 tableId, address player, bytes calldata actionData) external;
    function settlePot(uint256 tableId, address[] calldata winners) external;
}
```

## 📁 Planned Directory Structure

```
blockchain/
├── README.md                 # This file
├── contracts/                # Contract client interfaces
│   ├── gameEngine.ts         # GameEngine contract client
│   ├── handEvaluator.ts      # HandEvaluator contract client
│   ├── rng.ts               # RNG/VRF contract client
│   └── index.ts             # Contract exports
├── gameEngine.ts             # Blockchain-based GameEngine implementation
├── handEvaluator.ts          # On-chain hand evaluation
├── rng.ts                   # VRF-based randomness
├── stateManager.ts          # On-chain state management
├── types.ts                 # Blockchain-specific types
└── utils.ts                 # Blockchain utilities
```

## 🛠️ Development Approach

### 1. Interface Compatibility
The blockchain implementation will maintain the same interface as the current TypeScript version:
```typescript
// Both implementations share the same interface
import { GameEngine } from '../game-engine';        // Current
import { GameEngine } from '../blockchain';         // Future

// Same API, different implementation
const engine = new GameEngine(tableId);
await engine.startHand();
```

### 2. Gradual Migration
Components can be migrated incrementally:
```typescript
// Hybrid approach during migration
class HybridGameEngine {
  // Fast operations: Keep in TypeScript
  private jsEngine = new JavaScriptGameEngine();
  
  // Security-critical: Use blockchain
  private blockchainEvaluator = new BlockchainHandEvaluator();
  
  async evaluateHand(cards: Card[]): Promise<HandRank> {
    // Use provable on-chain evaluation
    return await this.blockchainEvaluator.evaluate(cards);
  }
  
  handleFastAction(action: Action): void {
    // Keep fast local logic
    return this.jsEngine.handleAction(action);
  }
}
```

### 3. Testing Strategy
```typescript
// Both implementations can be tested against same test suite
describe('GameEngine', () => {
  const engines = [
    new JavaScriptGameEngine(),
    new BlockchainGameEngine()
  ];
  
  engines.forEach(engine => {
    it('should handle player actions', async () => {
      // Same test, different implementation
      await engine.startHand();
      expect(engine.getState().stage).toBe('preflop');
    });
  });
});
```

## 🎲 Benefits of Blockchain Integration

### Security
- **Provable Fairness**: All randomness verifiable on-chain
- **Tamper Proof**: Game logic immutable in smart contracts
- **Transparency**: Full game history on blockchain

### Trust
- **No House Edge**: Rules enforced by smart contracts
- **Verifiable Shuffles**: VRF-based card dealing
- **Public Audit**: Anyone can verify game integrity

### Innovation
- **NFT Integration**: Cards, avatars, table themes as NFTs
- **Tournament Tokens**: ERC-20/721 tournament entries
- **Staking**: Stake HYPE for table access

## 🚀 Getting Started (Future)

When blockchain integration is ready:

```bash
# Install smart contract dependencies
cd packages/nextjs/blockchain
npm install <smart-contract-sdk>

# Configure blockchain connection
cp .env.example .env
# Set RPC_URL and CONTRACT_ADDRESSES

# Run with blockchain backend
POKER_BACKEND=blockchain npm start
```

## 📚 Resources

- [Smart Contract Design Patterns](https://docs.openzeppelin.com/contracts)
- [Cairo Programming](https://cairo-book.github.io)
- [Foundry Framework](https://book.getfoundry.sh/)
- [Mental Poker Protocols](https://en.wikipedia.org/wiki/Mental_poker)

---

**Note**: This is a forward-looking design. Current game logic is fully functional in `../game-engine/` using pure TypeScript.
