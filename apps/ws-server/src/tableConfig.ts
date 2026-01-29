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
  stakeLevel: 'micro' | 'low' | 'mid' | 'high' | 'whale' | 'custom';
}

const DEFAULT_MAX_PLAYERS = 9;

/**
 * Cash-table buy-in policy (aligned with common online rooms: ~40–100 BB)
 * - Minimum: 40 BB (prevents ultra-short stacks)
 * - Maximum: 100 BB (standard full stack)
 * - Default: Max (encourages full-stack play)
 */
export function calculateBuyInLimits(bigBlind: number): { min: number; max: number; default: number } {
  const min = bigBlind * 40;
  const max = bigBlind * 100;
  return { min, max, default: max };
}

/**
 * All available table configurations
 */
export const TABLES: TableConfig[] = [
  {
    id: "cash-1-2",
    name: "1/2 NLH",
    blinds: { small: 1, big: 2 },
    maxPlayers: DEFAULT_MAX_PLAYERS,
    buyIn: calculateBuyInLimits(2), // 80–200 chips
    stakeLevel: "low",
  },
  {
    id: "cash-2-5",
    name: "2/5 NLH",
    blinds: { small: 2, big: 5 },
    maxPlayers: DEFAULT_MAX_PLAYERS,
    buyIn: calculateBuyInLimits(5), // 200–500 chips
    stakeLevel: "mid",
  },
  {
    id: "cash-5-10",
    name: "5/10 NLH",
    blinds: { small: 5, big: 10 },
    maxPlayers: DEFAULT_MAX_PLAYERS,
    buyIn: calculateBuyInLimits(10), // 400–1,000 chips
    stakeLevel: "high",
  },
  {
    id: "cash-50-100",
    name: "50/100 NLH",
    blinds: { small: 50, big: 100 },
    maxPlayers: DEFAULT_MAX_PLAYERS,
    buyIn: calculateBuyInLimits(100), // 4,000–10,000 chips
    stakeLevel: "whale",
  },
];

let runtimeTables: TableConfig[] = TABLES;

/**
 * Override runtime table configs (e.g., load from DB)
 */
export function setTableConfigs(configs: TableConfig[]) {
  runtimeTables = configs;
}

export function listTableConfigs(): TableConfig[] {
  return runtimeTables;
}

/**
 * Get table configuration by ID
 */
export function getTableConfig(tableId: string): TableConfig | undefined {
  // Support dynamic/replicated tables by matching prefix before trailing instance suffix (e.g., "-n")
  const direct = runtimeTables.find((table) => table.id === tableId);
  if (direct) return direct;
  const baseId = tableId.replace(/-[0-9]+$/, "");
  return runtimeTables.find((table) => table.id === baseId);
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
