import { expect } from "chai";
import { ethers } from "hardhat";
import { PokerToken, PokerEscrow } from "../typechain-types";

describe("PokerToken & PokerEscrow", function () {
  const ADMIN = "0xDf6e59c6DF1E9500fd35A76FF4C62F9901E90019";
  const TEN_MILLION = ethers.parseEther("10000000");

  let token: PokerToken;
  let escrow: PokerEscrow;

  beforeEach(async function () {
    const [deployer] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("PokerToken");
    token = await Token.deploy(deployer.address);

    const Escrow = await ethers.getContractFactory("PokerEscrow");
    escrow = await Escrow.deploy(await token.getAddress(), ADMIN);

    await token.mint(await escrow.getAddress(), TEN_MILLION);
    await token.transferOwnership(await escrow.getAddress());
  });

  it("has correct name, symbol, and max supply constant", async function () {
    expect(await token.name()).to.equal("PokerWars");
    expect(await token.symbol()).to.equal("POKER");
    expect(await token.MAX_SUPPLY()).to.equal(ethers.parseEther("5000000000"));
  });

  it("escrow holds 10M tokens", async function () {
    expect(await escrow.balance()).to.equal(TEN_MILLION);
  });

  it("initial admin is set", async function () {
    expect(await escrow.admins(ADMIN)).to.be.true;
  });

  it("non-admin cannot send tokens", async function () {
    const [, stranger] = await ethers.getSigners();
    await expect(
      escrow.connect(stranger).sendTokens(stranger.address, 1000)
    ).to.be.revertedWith("Not admin");
  });

  it("rejects minting beyond max supply", async function () {
    const [deployer] = await ethers.getSigners();
    // Deploy a fresh token where deployer is still owner
    const Token = await ethers.getContractFactory("PokerToken");
    const t = await Token.deploy(deployer.address);
    const max = await t.MAX_SUPPLY();
    await expect(t.mint(deployer.address, max + 1n)).to.be.revertedWith("Exceeds max supply");
  });
});
