export async function GET(_: Request) {
  const assetId = process.env.HYPERLIQUID_PRICE_ID ?? "hyperliquid";
  const apiUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
    assetId,
  )}&vs_currencies=usd`;

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`coingecko response status: ${response.status}`);
    }
    const json = await response.json();
    return Response.json(json);
  } catch (e) {
    return Response.json({
      [assetId]: { usd: 0 },
    });
  }
}
