export function calculatePrizeDistribution(
  price: number,
  players: number,
): number[] {
  const totalPrize = price * players;
  const weights = Array.from({ length: players }, (_, i) => players - i);
  const weightSum = (players * (players + 1)) / 2;
  return weights.map((w) =>
    parseFloat(((totalPrize * w) / weightSum).toFixed(2)),
  );
}

export default calculatePrizeDistribution;
