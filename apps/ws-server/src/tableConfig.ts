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
 * Cash-table buy-in policy (aligned with common online rooms: 30–100 BB)
 * - Minimum: 30 BB (prevents ultra-short stacks)
 * - Maximum: 100 BB (standard full stack)
 * - Default: Max (encourages full-stack play)
 */
export function calculateBuyInLimits(bigBlind: number): { min: number; max: number; default: number } {
  const min = bigBlind * 30;
  const max = bigBlind * 100;
  return { min, max, default: max };
}

/**
 * All available table configurations
 */
export const TABLES: TableConfig[] = [
  {
    id: "cash-3a1b",
    "name": "1/2 NLH",
    blinds: { small: 1, big: 2 },
    maxPlayers: DEFAULT_MAX_PLAYERS,
    buyIn: calculateBuyInLimits(2), // 60–200 chips
    stakeLevel: "low",
  },
  {
    id: "cash-7c2d",
    "name": "2/5 NLH",
    blinds: { small: 2, big: 5 },
    maxPlayers: DEFAULT_MAX_PLAYERS,
    buyIn: calculateBuyInLimits(5), // 150–500 chips
    stakeLevel: "mid",
  },
  {
    id: "cash-9e4f",
    "name": "5/10 NLH",
    blinds: { small: 5, big: 10 },
    maxPlayers: DEFAULT_MAX_PLAYERS,
    buyIn: calculateBuyInLimits(10), // 300–1,000 chips
    stakeLevel: "high",
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
export function validateBuyIn(tableId: string, chips: number, minOverride?: number): { valid: boolean; error?: string; suggested?: number } {
  const config = getTableConfig(tableId);
  if (!config) {
    return { valid: false, error: 'Table not found' };
  }

  // Use the larger of the config minimum or the override (rejoin protection)
  const effectiveMin = minOverride !== undefined ? Math.max(config.buyIn.min, minOverride) : config.buyIn.min;
  
  const minBB = Math.round(effectiveMin / config.blinds.big);
  const maxBB = Math.round(config.buyIn.max / config.blinds.big);
  
  if (chips < effectiveMin) {
    const errorMsg = minOverride !== undefined && minOverride > config.buyIn.min
      ? `Re-entry minimum required: ${minOverride} chips`
      : `Buy-in too small (minimum: ${minBB} BB)`;

    return { 
      valid: false, 
      error: errorMsg,
      suggested: effectiveMin
    };
  }
  
  if (chips > config.buyIn.max) {
    return {
      valid: false,
      error: `Buy-in too large (maximum: ${maxBB} BB)`, 
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
