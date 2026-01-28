/**
 * Utility functions for server
 */

export function shortAddress(address: string | null | undefined): string {
  if (!address) return "Unknown";
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}