// Precomputed tables from HenryRLee/PokerHandEvaluator
export { CHOOSE, DP, SUITS } from "./dptables";
export { FLUSH } from "./hashtable";
export { NO_FLUSH_5 } from "./hashtable5";
export { NO_FLUSH_6 } from "./hashtable6";
export { NO_FLUSH_7 } from "./hashtable7";

export const BINARIES_BY_ID: number[] = (() => {
  const arr: number[] = [];
  for (let i = 0; i < 13; i++) {
    const v = 1 << i;
    arr.push(v, v, v, v);
  }
  return arr;
})();

export const SUITBIT_BY_ID: number[] = (() => {
  const arr: number[] = [];
  const vals = [0x1, 0x8, 0x40, 0x200];
  for (let i = 0; i < 13; i++) arr.push(...vals);
  return arr;
})();
