import { expect } from "chai";
import { ethers } from "hardhat";
import { PokerTable } from "../typechain-types";

describe("PokerTable", function () {
  let table: PokerTable;
  let owner: any;
  let player1: any;
  let player2: any;

  const MIN_BUY_IN = ethers.parseEther("0.1");
  const MAX_BUY_IN = ethers.parseEther("10");

  beforeEach(async function () {
    [owner, player1, player2] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("PokerTable");
    table = await Factory.deploy(1, MIN_BUY_IN, MAX_BUY_IN, 9);
  });

  it("should allow a player to seat with valid buy-in", async function () {
    await table.connect(player1).seat({ value: MIN_BUY_IN });
    expect(await table.playerBalances(player1.address)).to.equal(MIN_BUY_IN);
  });

  it("should reject buy-in below minimum", async function () {
    await expect(
      table.connect(player1).seat({ value: ethers.parseEther("0.01") })
    ).to.be.revertedWith("Invalid buy-in");
  });

  it("should allow a player to leave and receive funds", async function () {
    await table.connect(player1).seat({ value: MIN_BUY_IN });
    await expect(table.connect(player1).leave()).to.changeEtherBalance(
      player1,
      MIN_BUY_IN
    );
  });

  it("should settle pot correctly", async function () {
    await table.connect(player1).seat({ value: ethers.parseEther("1") });
    await table.connect(player2).seat({ value: ethers.parseEther("1") });

    await table.settlePot(1, [player1.address], [ethers.parseEther("0.5")]);
    expect(await table.playerBalances(player1.address)).to.equal(
      ethers.parseEther("1.5")
    );
  });
});
