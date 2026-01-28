import { initChainIntegration, verifyNFTOwnership } from "./chain";

export function initChain() {
  return initChainIntegration();
}

export async function checkNFTOwnership(userAddress: string, tournamentId: string) {
  return verifyNFTOwnership(userAddress, tournamentId);
}
