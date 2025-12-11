const convert = (amount, decimals) => ethers.utils.parseUnits(amount, decimals);
const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * GLAZELETS SECURITY AUDIT - PROOF OF CONCEPT EXPLOITS
 *
 * This file demonstrates vulnerabilities found in the Glazelets contract.
 * The contract uses Donut tokens for payment (burned on mint).
 */

let owner, attacker, user0, user1;
let glazelets, donut;

const MINT_PRICE = convert("100", 18); // 100 DONUT tokens

describe("SECURITY AUDIT - Glazelets Vulnerabilities", function () {

  beforeEach("Deploy fresh contracts", async function () {
    [owner, attacker, user0, user1] = await ethers.getSigners();

    // Deploy Donut token first
    const donutArtifact = await ethers.getContractFactory("Donut");
    donut = await donutArtifact.deploy();
    await donut.deployed();

    // Deploy Glazelets with Donut token address
    const glazeletsArtifact = await ethers.getContractFactory("Glazelets");
    glazelets = await glazeletsArtifact.deploy(MINT_PRICE, donut.address);
    await glazelets.deployed();

    // Mint Donut tokens to users for testing
    const mintAmount = convert("10000", 18);
    await donut.connect(owner).mint(attacker.address, mintAmount);
    await donut.connect(owner).mint(user0.address, mintAmount);
    await donut.connect(owner).mint(user1.address, mintAmount);

    // Approve Glazelets to spend Donut tokens
    await donut.connect(attacker).approve(glazelets.address, ethers.constants.MaxUint256);
    await donut.connect(user0).approve(glazelets.address, ethers.constants.MaxUint256);
    await donut.connect(user1).approve(glazelets.address, ethers.constants.MaxUint256);
  });

  // ============================================
  // CRITICAL: REENTRANCY VULNERABILITY
  // ============================================
  describe("CRITICAL: Reentrancy Attack via onERC721Received", function () {
    /**
     * VULNERABILITY: The _safeMint() function triggers onERC721Received callback
     * on the recipient contract. An attacker could try to re-enter mint().
     *
     * FIXED: ReentrancyGuard prevents this attack.
     */

    it("FIXED: Reentrancy attack fails due to nonReentrant modifier", async function () {
      // Deploy malicious reentrancy contract
      const ReentrancyAttacker = await ethers.getContractFactory("ReentrancyAttacker");
      const attackContract = await ReentrancyAttacker.deploy(glazelets.address);
      await attackContract.deployed();

      // Fund the attacker contract with Donut tokens
      const attackFunds = convert("1000", 18);
      await donut.connect(owner).mint(attackContract.address, attackFunds);

      // Execute attack - should revert due to ReentrancyGuard
      await expect(
        attackContract.connect(attacker).attack()
      ).to.be.revertedWith("ReentrancyGuard: reentrant call");
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
     */

    it("POC: Deploy multiple contracts to bypass wallet limit", async function () {
      const MintProxy = await ethers.getContractFactory("MintProxy");

      // Attacker approves spending for the test
      await donut.connect(attacker).approve(attacker.address, ethers.constants.MaxUint256);

      // Deploy 5 proxy contracts and mint 4 from each = 20 tokens
      let totalMinted = 0;
      for (let i = 0; i < 5; i++) {
        const proxy = await MintProxy.deploy(glazelets.address);
        await proxy.deployed();

        // Approve proxy to spend attacker's Donut tokens
        await donut.connect(attacker).approve(proxy.address, ethers.constants.MaxUint256);

        // Mint 4 tokens through each proxy
        for (let j = 0; j < 4; j++) {
          await proxy.connect(attacker).mintFor(attacker.address, `origin-${i}-${j}`);
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
     */

    it("INFO: Price change can be front-run (demonstrated scenario)", async function () {
      // User sees owner's pending tx to lower price
      // MEV bot front-runs to ensure user pays higher price

      await glazelets.connect(user0).mint("origin1");

      // Owner lowers price
      const newPrice = convert("50", 18);
      await glazelets.connect(owner).setMintPrice(newPrice);

      // User1 pays the new lower price
      await glazelets.connect(user1).mint("origin2");

      // This demonstrates the timing issue - transactions in the same block
      // can have different prices depending on ordering
      expect(await glazelets.mintPrice()).to.equal(newPrice);
    });
  });

  // ============================================
  // LOW: Events - VERIFIED WORKING
  // ============================================
  describe("LOW: Events - VERIFIED", function () {
    /**
     * Events are emitted for important state changes.
     */

    it("Glazelets__MintPriceChanged event emitted", async function () {
      const oldPrice = MINT_PRICE;
      const newPrice = convert("200", 18);

      await expect(glazelets.connect(owner).setMintPrice(newPrice))
        .to.emit(glazelets, "Glazelets__MintPriceChanged")
        .withArgs(oldPrice, newPrice);
    });

    it("Glazelets__BaseURIChanged event emitted", async function () {
      const newURI = "ipfs://QmNewCID/";

      await expect(glazelets.connect(owner).setBaseURI(newURI))
        .to.emit(glazelets, "Glazelets__BaseURIChanged")
        .withArgs(newURI);
    });

    it("Glazelets__Minted event emitted", async function () {
      await expect(glazelets.connect(user0).mint("test-origin"))
        .to.emit(glazelets, "Glazelets__Minted")
        .withArgs(0, user0.address, "test-origin");
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
     * 3. Can renounce ownership (inherited from Ownable)
     *
     * Impact: Users must trust the owner completely.
     */

    it("Owner can rug-pull metadata by changing baseURI", async function () {
      await glazelets.connect(owner).setBaseURI("ipfs://QmRealArt/");
      await glazelets.connect(user0).mint("origin1");

      expect(await glazelets.tokenURI(0)).to.equal("ipfs://QmRealArt/0");

      // Owner rugs the metadata
      await glazelets.connect(owner).setBaseURI("ipfs://QmScamArt/");

      expect(await glazelets.tokenURI(0)).to.equal("ipfs://QmScamArt/0");
    });

    it("Owner can set extremely high mint price", async function () {
      const absurdPrice = convert("1000000", 18); // 1 million DONUT
      await glazelets.connect(owner).setMintPrice(absurdPrice);

      await expect(
        glazelets.connect(user0).mint("origin1")
      ).to.be.revertedWith("GLZE: Insufficient DONUT balance");
    });

    it("Owner can renounce ownership leaving contract unmanaged", async function () {
      await glazelets.connect(owner).renounceOwnership();

      expect(await glazelets.owner()).to.equal(ethers.constants.AddressZero);

      // Now no one can update settings
      await expect(
        glazelets.connect(owner).setMintPrice(convert("50", 18))
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
      const tx = await glazelets.connect(user0).mint("origin1");
      const receipt = await tx.wait();
      console.log(`    Gas used for single mint: ${receipt.gasUsed.toString()}`);
    });
  });

  // ============================================
  // INFO: Donut Token Burning
  // ============================================
  describe("INFO: Donut Token Economics", function () {
    /**
     * The contract burns Donut tokens on mint, creating deflationary pressure.
     */

    it("Donut tokens are burned on mint", async function () {
      const initialSupply = await donut.totalSupply();

      await glazelets.connect(user0).mint("origin1");

      const finalSupply = await donut.totalSupply();
      expect(finalSupply).to.equal(initialSupply.sub(MINT_PRICE));
    });

    it("Contract holds no Donut tokens after mint", async function () {
      await glazelets.connect(user0).mint("origin1");
      await glazelets.connect(user1).mint("origin2");

      expect(await donut.balanceOf(glazelets.address)).to.equal(0);
    });
  });
});
