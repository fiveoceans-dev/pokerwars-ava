import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const PokerTable = await ethers.getContractFactory("PokerTable");

  const tableId = 1;
  const minBuyIn = ethers.parseEther("0.1");
  const maxBuyIn = ethers.parseEther("10");
  const maxSeats = 9;

  const table = await PokerTable.deploy(tableId, minBuyIn, maxBuyIn, maxSeats);
  await table.waitForDeployment();

  console.log("PokerTable deployed to:", await table.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
