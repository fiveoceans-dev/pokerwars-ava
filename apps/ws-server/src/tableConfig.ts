/**
 * Table Configuration System
 * 
 * Defines table configurations with different blinds and buy-in rules.
 * Supports multiple stake levels for diverse player preferences.
 */

export interface TableConfig {
  id: string;
  name: string;
  blinds: {
    small: number;
    big: number;
  };
  maxPlayers: number;
  buyIn: {
    min: number; // In chips
    max: number; // In chips  
    default: number; // In chips
  };
  stakeLevel: 'micro' | 'low' | 'mid' | 'high' | 'whale';
}

const DEFAULT_MAX_PLAYERS = 9;

/**
 * Calculate buy-in limits based on big blind
 * Standard poker buy-in rules:
 * - Minimum: 20 BB
 * - Maximum: 200 BB
 * - Default: Maximum allowed for competitive play
 */
export function calculateBuyInLimits(bigBlind: number): { min: number; max: number; default: number } {
  const min = bigBlind * 20;  // 20 BB minimum
  const max = bigBlind * 200; // 200 BB maximum
  const defaultBuyIn = max;   // Start with max for competitive play
  
  return { min, max, default: defaultBuyIn };
}

/**
 * All available table configurations
 */
export const TABLES: TableConfig[] = [
  // Micro Stakes - Perfect for learning and casual play
  {
    id: "micro-1",
    name: "Micro Stakes 1",
    blinds: { small: 1, big: 2 },
    maxPlayers: DEFAULT_MAX_PLAYERS,
    buyIn: calculateBuyInLimits(2), // 40-400 chips
    stakeLevel: 'micro'
  },
  {
    id: "micro-2", 
    name: "Micro Stakes 2",
    blinds: { small: 1, big: 2 },
    maxPlayers: DEFAULT_MAX_PLAYERS,
    buyIn: calculateBuyInLimits(2),
    stakeLevel: 'micro'
  },
  
  // Low Stakes - Standard entry level
  {
    id: "low-1",
    name: "Low Stakes 1", 
    blinds: { small: 5, big: 10 },
    maxPlayers: DEFAULT_MAX_PLAYERS,
    buyIn: calculateBuyInLimits(10), // 200-2,000 chips
    stakeLevel: 'low'
  },
  {
    id: "low-2",
    name: "Low Stakes 2",
    blinds: { small: 5, big: 10 },
    maxPlayers: DEFAULT_MAX_PLAYERS,
    buyIn: calculateBuyInLimits(10),
    stakeLevel: 'low'
  },
  {
    id: "low-6max-1",
    name: "Low Stakes 6-Max",
    blinds: { small: 5, big: 10 },
    maxPlayers: 6,
    buyIn: calculateBuyInLimits(10),
    stakeLevel: 'low'
  },
  {
    id: "low-hu-1",
    name: "Low Stakes Heads-Up",
    blinds: { small: 5, big: 10 },
    maxPlayers: 2,
    buyIn: calculateBuyInLimits(10),
    stakeLevel: 'low'
  },
  
  // Mid Stakes - Serious players
  {
    id: "mid-1",
    name: "Mid Stakes 1",
    blinds: { small: 25, big: 50 },
    maxPlayers: DEFAULT_MAX_PLAYERS,
    buyIn: calculateBuyInLimits(50), // 1,000-10,000 chips
    stakeLevel: 'mid'
  },
  {
    id: "mid-2", 
    name: "Mid Stakes 2", 
    blinds: { small: 25, big: 50 },
    maxPlayers: DEFAULT_MAX_PLAYERS,
    buyIn: calculateBuyInLimits(50),
    stakeLevel: 'mid'
  },
  
  // High Stakes - Experienced players
  {
    id: "high-1",
    name: "High Stakes 1",
    blinds: { small: 50, big: 100 },
    maxPlayers: DEFAULT_MAX_PLAYERS,
    buyIn: calculateBuyInLimits(100), // 2,000-20,000 chips  
    stakeLevel: 'high'
  },
  {
    id: "high-2",
    name: "High Stakes 2",
    blinds: { small: 50, big: 100 },
    maxPlayers: DEFAULT_MAX_PLAYERS,
    buyIn: calculateBuyInLimits(100),
    stakeLevel: 'high'
  },
  
  // High Roller - Elite level
  {
    id: "whale-1",
    name: "👑 Whale 1",
    blinds: { small: 1000, big: 2000 },
    maxPlayers: DEFAULT_MAX_PLAYERS,
    buyIn: calculateBuyInLimits(2000), // 40,000-400,000 chips
    stakeLevel: 'whale'
  },
  {
    id: "whale-2", 
    name: "👑 Whale 2",
    blinds: { small: 1000, big: 2000 },
    maxPlayers: DEFAULT_MAX_PLAYERS,
    buyIn: calculateBuyInLimits(2000),
    stakeLevel: 'whale'
  }
];

/**
 * Get table configuration by ID
 */
export function getTableConfig(tableId: string): TableConfig | undefined {
  return TABLES.find(table => table.id === tableId);
}

/**
 * Get all tables by stake level
 */
export function getTablesByStakeLevel(level: TableConfig['stakeLevel']): TableConfig[] {
  return TABLES.filter(table => table.stakeLevel === level);
}

/**
 * Validate buy-in amount for a table
 */
export function validateBuyIn(tableId: string, chips: number): { valid: boolean; error?: string; suggested?: number } {
  const config = getTableConfig(tableId);
  if (!config) {
    return { valid: false, error: 'Table not found' };
  }
  
  if (chips < config.buyIn.min) {
    return { 
      valid: false, 
      error: `Buy-in too small (minimum: ${config.buyIn.min} chips)`,
      suggested: config.buyIn.min
    };
  }
  
  if (chips > config.buyIn.max) {
    return {
      valid: false,
      error: `Buy-in too large (maximum: ${config.buyIn.max} chips)`, 
      suggested: config.buyIn.max
    };
  }
  
  return { valid: true };
}

/**
 * Get recommended buy-in (max allowed) for a table
 */
export function getRecommendedBuyIn(tableId: string): number {
  const config = getTableConfig(tableId);
  return config?.buyIn.default ?? 2000; // Fallback to 2000 chips
}
