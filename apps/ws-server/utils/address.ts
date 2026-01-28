export function randomAddress(): string {
  const bytes = new Uint8Array(20);
  if (
    typeof window !== "undefined" &&
    window.crypto &&
    window.crypto.getRandomValues
  ) {
    window.crypto.getRandomValues(bytes);
  } else {
    // fallback for server-side rendering
    const { randomFillSync } = require("crypto");
    randomFillSync(bytes);
  }
  return (
    "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  );
}

export function shortAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 5)}...${addr.slice(-4)}`;
}
