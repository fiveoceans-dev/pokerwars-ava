import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying BankEscrow with:", deployer.address);

  // Avalanche Mainnet USDC address
  const USDC_AVALANCHE = "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E";
  // Fuji Testnet - use a mock or zero address (no official USDC)
  const USDC_FUJI = "0x0000000000000000000000000000000000000000";

  // Admin wallet
  const ADMIN_WALLET = "0xDf6e59c6DF1E9500fd35A76FF4C62F9901E90019";

  // Detect network
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  
  let usdcAddress: string;
  if (chainId === 43114) {
    // Avalanche Mainnet
    usdcAddress = USDC_AVALANCHE;
    console.log("Deploying to Avalanche Mainnet with USDC:", usdcAddress);
  } else {
    // Fuji or other testnet
    usdcAddress = USDC_FUJI;
    console.log("Deploying to testnet - USDC will need to be added manually");
  }

  const BankEscrow = await ethers.getContractFactory("BankEscrow");
  const escrow = await BankEscrow.deploy(ADMIN_WALLET, usdcAddress);
  await escrow.waitForDeployment();

  const escrowAddress = await escrow.getAddress();
  console.log("BankEscrow deployed to:", escrowAddress);
  console.log("Admin:", ADMIN_WALLET);
  
  if (usdcAddress !== USDC_FUJI) {
    console.log("USDC approved:", usdcAddress);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
