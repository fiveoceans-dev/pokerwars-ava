import { ethers } from "hardhat";

const INITIAL_ADMIN = "0xDf6e59c6DF1E9500fd35A76FF4C62F9901E90019";
const INITIAL_MINT = ethers.parseEther("10000000"); // 10 million tokens

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // 1. Deploy PokerToken (deployer is initial owner for minting)
  const Token = await ethers.getContractFactory("PokerToken");
  const token = await Token.deploy(deployer.address);
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log("PokerToken deployed to:", tokenAddr);

  // 2. Deploy Escrow with initial admin
  const Escrow = await ethers.getContractFactory("PokerEscrow");
  const escrow = await Escrow.deploy(tokenAddr, INITIAL_ADMIN);
  await escrow.waitForDeployment();
  const escrowAddr = await escrow.getAddress();
  console.log("PokerEscrow deployed to:", escrowAddr);

  // 3. Mint initial 10M tokens to escrow
  const mintTx = await token.mint(escrowAddr, INITIAL_MINT);
  await mintTx.wait();
  console.log("Minted 10,000,000 $POKER to escrow");

  // 4. Transfer token ownership to escrow so it can issue new tokens
  const transferTx = await token.transferOwnership(escrowAddr);
  await transferTx.wait();
  console.log("Token ownership transferred to escrow");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
