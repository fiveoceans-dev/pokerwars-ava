import { expect } from "chai";
import { ethers } from "hardhat";
import { BankEscrow, PokerToken } from "../typechain-types";

describe("BankEscrow", function () {
  let escrow: BankEscrow;
  let token: PokerToken;
  let admin: any;
  let player1: any;
  let player2: any;

  const DEPOSIT_AMOUNT = ethers.parseEther("100");

  beforeEach(async function () {
    [admin, player1, player2] = await ethers.getSigners();

    // Deploy a test token
    const TokenFactory = await ethers.getContractFactory("PokerToken");
    token = await TokenFactory.deploy(admin.address);

    // Mint tokens to players
    await token.mint(player1.address, ethers.parseEther("1000"));
    await token.mint(player2.address, ethers.parseEther("1000"));

    // Deploy BankEscrow with token pre-approved
    const EscrowFactory = await ethers.getContractFactory("BankEscrow");
    escrow = await EscrowFactory.deploy(admin.address, await token.getAddress());
  });

  describe("Token Management", function () {
    it("should have token approved by default", async function () {
      expect(await escrow.approvedTokens(await token.getAddress())).to.be.true;
    });

    it("should allow admin to approve new tokens", async function () {
      const newToken = ethers.Wallet.createRandom().address;
      await escrow.approveToken(newToken);
      expect(await escrow.approvedTokens(newToken)).to.be.true;
    });

    it("should allow admin to revoke tokens", async function () {
      await escrow.revokeToken(await token.getAddress());
      expect(await escrow.approvedTokens(await token.getAddress())).to.be.false;
    });
  });

  describe("Deposits", function () {
    it("should accept deposits from players", async function () {
      await token.connect(player1).approve(await escrow.getAddress(), DEPOSIT_AMOUNT);
      await escrow.connect(player1).deposit(
        await token.getAddress(),
        DEPOSIT_AMOUNT,
        "cash",
        "table-1"
      );

      expect(await escrow.getPlayerBalance(player1.address, await token.getAddress()))
        .to.equal(DEPOSIT_AMOUNT);
    });

    it("should reject deposits for unapproved tokens", async function () {
      const fakeToken = ethers.Wallet.createRandom().address;
      await expect(
        escrow.connect(player1).deposit(fakeToken, DEPOSIT_AMOUNT, "cash", "table-1")
      ).to.be.revertedWith("Token not approved");
    });
  });

  describe("Payouts", function () {
    beforeEach(async function () {
      // Player deposits first
      await token.connect(player1).approve(await escrow.getAddress(), DEPOSIT_AMOUNT);
      await escrow.connect(player1).deposit(
        await token.getAddress(),
        DEPOSIT_AMOUNT,
        "cash",
        "table-1"
      );
    });

    it("should allow admin to payout to player", async function () {
      const payoutAmount = ethers.parseEther("50");
      await escrow.payout(
        player1.address,
        await token.getAddress(),
        payoutAmount,
        "cash",
        "table-1"
      );

      expect(await escrow.getPlayerBalance(player1.address, await token.getAddress()))
        .to.equal(DEPOSIT_AMOUNT - payoutAmount);
    });

    it("should reject payout from non-admin", async function () {
      await expect(
        escrow.connect(player1).payout(
          player1.address,
          await token.getAddress(),
          DEPOSIT_AMOUNT,
          "cash",
          "table-1"
        )
      ).to.be.revertedWith("Not admin");
    });

    it("should handle batch payouts", async function () {
      // Player2 also deposits
      await token.connect(player2).approve(await escrow.getAddress(), DEPOSIT_AMOUNT);
      await escrow.connect(player2).deposit(
        await token.getAddress(),
        DEPOSIT_AMOUNT,
        "sng",
        "sng-1"
      );

      const amounts = [ethers.parseEther("60"), ethers.parseEther("40")];
      await escrow.batchPayout(
        [player1.address, player2.address],
        await token.getAddress(),
        amounts,
        "sng",
        "sng-1"
      );

      expect(await escrow.getPlayerBalance(player1.address, await token.getAddress()))
        .to.equal(DEPOSIT_AMOUNT - amounts[0]);
    });
  });

  describe("Admin Management", function () {
    it("should allow admin to add new admin", async function () {
      await escrow.addAdmin(player1.address);
      expect(await escrow.admins(player1.address)).to.be.true;
    });

    it("should prevent admin from removing themselves", async function () {
      await expect(escrow.removeAdmin(admin.address))
        .to.be.revertedWith("Cannot remove self");
    });
  });
});
