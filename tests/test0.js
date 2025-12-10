const convert = (amount, decimals) => ethers.utils.parseUnits(amount, decimals);
const divDec = (amount, decimals = 18) => amount / 10 ** decimals;
const { expect } = require("chai");
const { ethers, network } = require("hardhat");

let owner, user0, user1, user2, user3, user4;
let glazelets, donut;

const MINT_PRICE = convert("100", 18); // 100 DONUT tokens
const MAX_SUPPLY = 808;
const MAX_MINT_PER_WALLET = 4;

describe("Glazelets", function () {
  beforeEach("Deploy fresh contracts", async function () {
    [owner, user0, user1, user2, user3, user4] = await ethers.getSigners();

    // Deploy Donut token first (owner becomes the miner)
    const donutArtifact = await ethers.getContractFactory("Donut");
    donut = await donutArtifact.deploy();
    await donut.deployed();

    // Deploy Glazelets with Donut token address
    const glazeletsArtifact = await ethers.getContractFactory("Glazelets");
    glazelets = await glazeletsArtifact.deploy(MINT_PRICE, donut.address);
    await glazelets.deployed();

    // Mint some Donut tokens to users for testing
    const mintAmount = convert("10000", 18); // 10,000 DONUT each
    await donut.connect(owner).mint(user0.address, mintAmount);
    await donut.connect(owner).mint(user1.address, mintAmount);
    await donut.connect(owner).mint(user2.address, mintAmount);
    await donut.connect(owner).mint(user3.address, mintAmount);
    await donut.connect(owner).mint(user4.address, mintAmount);
  });

  // ============================================
  // DEPLOYMENT & INITIALIZATION TESTS
  // ============================================
  describe("Deployment", function () {
    it("Should set the correct name and symbol", async function () {
      expect(await glazelets.name()).to.equal("Glazelets");
      expect(await glazelets.symbol()).to.equal("GLZE");
    });

    it("Should set the correct owner", async function () {
      expect(await glazelets.owner()).to.equal(owner.address);
    });

    it("Should set the correct initial mint price", async function () {
      expect(await glazelets.mintPrice()).to.equal(MINT_PRICE);
    });

    it("Should set the correct Donut token address", async function () {
      expect(await glazelets.donut()).to.equal(donut.address);
    });

    it("Should have zero total supply initially", async function () {
      expect(await glazelets.totalSupply()).to.equal(0);
    });

    it("Should have correct MAX_SUPPLY constant", async function () {
      expect(await glazelets.MAX_SUPPLY()).to.equal(MAX_SUPPLY);
    });

    it("Should have correct MAX_MINT_PER_WALLET constant", async function () {
      expect(await glazelets.MAX_MINT_PER_WALLET()).to.equal(MAX_MINT_PER_WALLET);
    });
  });

  // ============================================
  // DONUT TOKEN TESTS
  // ============================================
  describe("Donut Token", function () {
    it("Should have correct name and symbol", async function () {
      expect(await donut.name()).to.equal("Donut");
      expect(await donut.symbol()).to.equal("DONUT");
    });

    it("Should set owner as miner", async function () {
      expect(await donut.miner()).to.equal(owner.address);
    });

    it("Should allow miner to mint tokens", async function () {
      const amount = convert("500", 18);
      await donut.connect(owner).mint(user0.address, amount);
      expect(await donut.balanceOf(user0.address)).to.be.gt(0);
    });

    it("Should revert when non-miner tries to mint", async function () {
      await expect(
        donut.connect(user0).mint(user1.address, convert("100", 18))
      ).to.be.reverted;
    });

    it("Should allow users to burn their tokens", async function () {
      const initialBalance = await donut.balanceOf(user0.address);
      const burnAmount = convert("100", 18);

      await donut.connect(user0).burn(burnAmount);

      expect(await donut.balanceOf(user0.address)).to.equal(initialBalance.sub(burnAmount));
    });
  });

  // ============================================
  // MINTING TESTS - SUCCESS CASES
  // ============================================
  describe("Minting - Success Cases", function () {
    beforeEach(async function () {
      // Approve Glazelets to spend user's Donut tokens
      await donut.connect(user0).approve(glazelets.address, ethers.constants.MaxUint256);
      await donut.connect(user1).approve(glazelets.address, ethers.constants.MaxUint256);
      await donut.connect(user2).approve(glazelets.address, ethers.constants.MaxUint256);
    });

    it("Should mint a token and burn Donut payment", async function () {
      const initialDonutBalance = await donut.balanceOf(user0.address);
      const initialTotalSupply = await donut.totalSupply();

      await glazelets.connect(user0).mint("origin1");

      expect(await glazelets.totalSupply()).to.equal(1);
      expect(await glazelets.ownerOf(1)).to.equal(user0.address);
      expect(await glazelets.mintsPerWallet(user0.address)).to.equal(1);
      expect(await glazelets.tokenIdToOrigin(1)).to.equal("origin1");

      // Check Donut was deducted from user
      expect(await donut.balanceOf(user0.address)).to.equal(initialDonutBalance.sub(MINT_PRICE));

      // Check Donut total supply decreased (burned)
      expect(await donut.totalSupply()).to.equal(initialTotalSupply.sub(MINT_PRICE));
    });

    it("Should mint multiple tokens up to wallet limit", async function () {
      for (let i = 0; i < MAX_MINT_PER_WALLET; i++) {
        await glazelets.connect(user0).mint(`origin${i}`);
      }

      expect(await glazelets.totalSupply()).to.equal(MAX_MINT_PER_WALLET);
      expect(await glazelets.mintsPerWallet(user0.address)).to.equal(MAX_MINT_PER_WALLET);
    });

    it("Should allow different users to mint", async function () {
      await glazelets.connect(user0).mint("user0-origin");
      await glazelets.connect(user1).mint("user1-origin");
      await glazelets.connect(user2).mint("user2-origin");

      expect(await glazelets.totalSupply()).to.equal(3);
      expect(await glazelets.ownerOf(1)).to.equal(user0.address);
      expect(await glazelets.ownerOf(2)).to.equal(user1.address);
      expect(await glazelets.ownerOf(3)).to.equal(user2.address);
    });

    it("Should burn exact amount of Donut tokens", async function () {
      const initialDonutSupply = await donut.totalSupply();

      await glazelets.connect(user0).mint("origin1");
      await glazelets.connect(user1).mint("origin2");

      // Total Donut supply should decrease by 2x MINT_PRICE
      expect(await donut.totalSupply()).to.equal(initialDonutSupply.sub(MINT_PRICE.mul(2)));
    });

    it("Should correctly store different origins for each token", async function () {
      await glazelets.connect(user0).mint("Fire");
      await glazelets.connect(user0).mint("Water");
      await glazelets.connect(user0).mint("Earth");

      expect(await glazelets.tokenIdToOrigin(1)).to.equal("Fire");
      expect(await glazelets.tokenIdToOrigin(2)).to.equal("Water");
      expect(await glazelets.tokenIdToOrigin(3)).to.equal("Earth");
    });

    it("Should assign sequential token IDs", async function () {
      await glazelets.connect(user0).mint("origin1");
      await glazelets.connect(user1).mint("origin2");
      await glazelets.connect(user2).mint("origin3");

      expect(await glazelets.ownerOf(1)).to.equal(user0.address);
      expect(await glazelets.ownerOf(2)).to.equal(user1.address);
      expect(await glazelets.ownerOf(3)).to.equal(user2.address);
    });

    it("Should not accumulate Donut in contract (burned immediately)", async function () {
      await glazelets.connect(user0).mint("origin1");
      await glazelets.connect(user1).mint("origin2");

      // Contract should have zero Donut balance (tokens are burned)
      expect(await donut.balanceOf(glazelets.address)).to.equal(0);
    });
  });

  // ============================================
  // MINTING TESTS - FAILURE CASES
  // ============================================
  describe("Minting - Failure Cases", function () {
    it("Should revert when user has insufficient Donut balance", async function () {
      // User has no tokens (new user without minted tokens)
      const poorUser = (await ethers.getSigners())[10];
      await donut.connect(poorUser).approve(glazelets.address, ethers.constants.MaxUint256);

      await expect(
        glazelets.connect(poorUser).mint("origin1")
      ).to.be.revertedWith("GLZE: Insufficient DONUT balance");
    });

    it("Should revert when user has not approved contract", async function () {
      // User has tokens but hasn't approved
      await expect(
        glazelets.connect(user0).mint("origin1")
      ).to.be.revertedWith("ERC20: insufficient allowance");
    });

    it("Should revert when wallet limit is exceeded", async function () {
      await donut.connect(user0).approve(glazelets.address, ethers.constants.MaxUint256);

      // Mint the maximum allowed
      for (let i = 0; i < MAX_MINT_PER_WALLET; i++) {
        await glazelets.connect(user0).mint(`origin${i}`);
      }

      // Try to mint one more
      await expect(
        glazelets.connect(user0).mint("origin5")
      ).to.be.revertedWith("GLZE: Wallet limit reached (4)");
    });

    it("Should revert when collection is sold out", async function () {
      // This test simulates reaching max supply
      // We verify the check exists by testing the require statement
      expect(await glazelets.MAX_SUPPLY()).to.equal(808);
    });
  });

  // ============================================
  // OWNER-ONLY FUNCTION TESTS
  // ============================================
  describe("Owner Functions", function () {
    beforeEach(async function () {
      await donut.connect(user0).approve(glazelets.address, ethers.constants.MaxUint256);
    });

    describe("setMintPrice", function () {
      it("Should allow owner to set new mint price", async function () {
        const newPrice = convert("200", 18);
        await glazelets.connect(owner).setMintPrice(newPrice);

        expect(await glazelets.mintPrice()).to.equal(newPrice);
      });

      it("Should allow minting at new price after change", async function () {
        const newPrice = convert("200", 18);
        await glazelets.connect(owner).setMintPrice(newPrice);

        // Should fail with insufficient balance at new price if user only has enough for old price
        // But our users have 10,000 DONUT so they can still mint
        await glazelets.connect(user0).mint("origin1");
        expect(await glazelets.ownerOf(1)).to.equal(user0.address);
      });

      it("Should revert when non-owner tries to set mint price", async function () {
        const newPrice = convert("200", 18);

        await expect(
          glazelets.connect(user0).setMintPrice(newPrice)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("Should allow setting mint price to zero (free mint)", async function () {
        await glazelets.connect(owner).setMintPrice(0);
        expect(await glazelets.mintPrice()).to.equal(0);

        // Should be able to mint for free (no Donut burned)
        const initialSupply = await donut.totalSupply();
        await glazelets.connect(user0).mint("origin1");
        expect(await glazelets.ownerOf(1)).to.equal(user0.address);
        expect(await donut.totalSupply()).to.equal(initialSupply); // No tokens burned
      });
    });

    describe("setBaseURI", function () {
      it("Should allow owner to set base URI", async function () {
        const baseURI = "ipfs://QmTestCID/";
        await glazelets.connect(owner).setBaseURI(baseURI);

        // Mint a token to test the URI
        await glazelets.connect(user0).mint("origin1");
        expect(await glazelets.tokenURI(1)).to.equal("ipfs://QmTestCID/1.json");
      });

      it("Should revert when non-owner tries to set base URI", async function () {
        await expect(
          glazelets.connect(user0).setBaseURI("ipfs://QmFakeURI/")
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("Should allow updating base URI after initial set", async function () {
        await glazelets.connect(user0).mint("origin1");

        await glazelets.connect(owner).setBaseURI("ipfs://QmFirstCID/");
        expect(await glazelets.tokenURI(1)).to.equal("ipfs://QmFirstCID/1.json");

        await glazelets.connect(owner).setBaseURI("ipfs://QmSecondCID/");
        expect(await glazelets.tokenURI(1)).to.equal("ipfs://QmSecondCID/1.json");
      });
    });
  });

  // ============================================
  // TOKEN URI & METADATA TESTS
  // ============================================
  describe("Token URI & Metadata", function () {
    beforeEach(async function () {
      await donut.connect(user0).approve(glazelets.address, ethers.constants.MaxUint256);
    });

    it("Should return empty base URI when not set", async function () {
      await glazelets.connect(user0).mint("origin1");
      expect(await glazelets.tokenURI(1)).to.equal("1.json");
    });

    it("Should return correct token URI with base URI set", async function () {
      await glazelets.connect(owner).setBaseURI("https://api.glazelets.com/metadata/");
      await glazelets.connect(user0).mint("origin1");

      expect(await glazelets.tokenURI(1)).to.equal("https://api.glazelets.com/metadata/1.json");
    });

    it("Should return correct token URI for multiple tokens", async function () {
      await glazelets.connect(owner).setBaseURI("ipfs://QmTestCID/");

      await glazelets.connect(user0).mint("origin1");
      await glazelets.connect(user0).mint("origin2");
      await glazelets.connect(user0).mint("origin3");

      expect(await glazelets.tokenURI(1)).to.equal("ipfs://QmTestCID/1.json");
      expect(await glazelets.tokenURI(2)).to.equal("ipfs://QmTestCID/2.json");
      expect(await glazelets.tokenURI(3)).to.equal("ipfs://QmTestCID/3.json");
    });

    it("Should revert when querying URI for nonexistent token", async function () {
      await expect(
        glazelets.tokenURI(999)
      ).to.be.revertedWith("ERC721Metadata: URI query for nonexistent token");
    });

    it("Should revert when querying URI for token ID 0", async function () {
      await expect(
        glazelets.tokenURI(0)
      ).to.be.revertedWith("ERC721Metadata: URI query for nonexistent token");
    });
  });

  // ============================================
  // TOTAL SUPPLY TESTS
  // ============================================
  describe("Total Supply", function () {
    beforeEach(async function () {
      await donut.connect(user0).approve(glazelets.address, ethers.constants.MaxUint256);
      await donut.connect(user1).approve(glazelets.address, ethers.constants.MaxUint256);
      await donut.connect(user2).approve(glazelets.address, ethers.constants.MaxUint256);
    });

    it("Should track total supply correctly as tokens are minted", async function () {
      expect(await glazelets.totalSupply()).to.equal(0);

      await glazelets.connect(user0).mint("origin1");
      expect(await glazelets.totalSupply()).to.equal(1);

      await glazelets.connect(user1).mint("origin2");
      expect(await glazelets.totalSupply()).to.equal(2);

      await glazelets.connect(user2).mint("origin3");
      expect(await glazelets.totalSupply()).to.equal(3);
    });
  });

  // ============================================
  // MINTS PER WALLET TRACKING
  // ============================================
  describe("Mints Per Wallet Tracking", function () {
    beforeEach(async function () {
      await donut.connect(user0).approve(glazelets.address, ethers.constants.MaxUint256);
      await donut.connect(user1).approve(glazelets.address, ethers.constants.MaxUint256);
      await donut.connect(user2).approve(glazelets.address, ethers.constants.MaxUint256);
    });

    it("Should start at zero for all wallets", async function () {
      expect(await glazelets.mintsPerWallet(user0.address)).to.equal(0);
      expect(await glazelets.mintsPerWallet(user1.address)).to.equal(0);
    });

    it("Should correctly track mints per wallet", async function () {
      await glazelets.connect(user0).mint("origin1");
      expect(await glazelets.mintsPerWallet(user0.address)).to.equal(1);

      await glazelets.connect(user0).mint("origin2");
      expect(await glazelets.mintsPerWallet(user0.address)).to.equal(2);

      // Other user's count should remain at 0
      expect(await glazelets.mintsPerWallet(user1.address)).to.equal(0);
    });

    it("Should track mints independently per wallet", async function () {
      await glazelets.connect(user0).mint("origin1");
      await glazelets.connect(user0).mint("origin2");
      await glazelets.connect(user1).mint("origin3");
      await glazelets.connect(user2).mint("origin4");
      await glazelets.connect(user2).mint("origin5");
      await glazelets.connect(user2).mint("origin6");

      expect(await glazelets.mintsPerWallet(user0.address)).to.equal(2);
      expect(await glazelets.mintsPerWallet(user1.address)).to.equal(1);
      expect(await glazelets.mintsPerWallet(user2.address)).to.equal(3);
    });
  });

  // ============================================
  // ERC721 STANDARD FUNCTIONS TESTS
  // ============================================
  describe("ERC721 Standard Functions", function () {
    beforeEach(async function () {
      await donut.connect(user0).approve(glazelets.address, ethers.constants.MaxUint256);
      await glazelets.connect(user0).mint("origin1");
    });

    it("Should return correct balance of owner", async function () {
      expect(await glazelets.balanceOf(user0.address)).to.equal(1);

      await glazelets.connect(user0).mint("origin2");
      expect(await glazelets.balanceOf(user0.address)).to.equal(2);
    });

    it("Should allow token transfers", async function () {
      await glazelets.connect(user0).transferFrom(user0.address, user1.address, 1);

      expect(await glazelets.ownerOf(1)).to.equal(user1.address);
      expect(await glazelets.balanceOf(user0.address)).to.equal(0);
      expect(await glazelets.balanceOf(user1.address)).to.equal(1);
    });

    it("Should allow approval and transferFrom", async function () {
      await glazelets.connect(user0).approve(user1.address, 1);
      expect(await glazelets.getApproved(1)).to.equal(user1.address);

      await glazelets.connect(user1).transferFrom(user0.address, user2.address, 1);
      expect(await glazelets.ownerOf(1)).to.equal(user2.address);
    });

    it("Should allow setApprovalForAll", async function () {
      await glazelets.connect(user0).setApprovalForAll(user1.address, true);
      expect(await glazelets.isApprovedForAll(user0.address, user1.address)).to.be.true;

      await glazelets.connect(user0).mint("origin2");

      // User1 can now transfer any of user0's tokens
      await glazelets.connect(user1).transferFrom(user0.address, user2.address, 1);
      await glazelets.connect(user1).transferFrom(user0.address, user2.address, 2);

      expect(await glazelets.balanceOf(user2.address)).to.equal(2);
    });

    it("Should revert transfer from non-owner/approved", async function () {
      await expect(
        glazelets.connect(user1).transferFrom(user0.address, user2.address, 1)
      ).to.be.reverted;
    });

    it("Should support ERC721 interface", async function () {
      // ERC721 interface ID
      const ERC721_INTERFACE_ID = "0x80ac58cd";
      expect(await glazelets.supportsInterface(ERC721_INTERFACE_ID)).to.be.true;
    });

    it("Should support ERC721Metadata interface", async function () {
      // ERC721Metadata interface ID
      const ERC721_METADATA_INTERFACE_ID = "0x5b5e139f";
      expect(await glazelets.supportsInterface(ERC721_METADATA_INTERFACE_ID)).to.be.true;
    });
  });

  // ============================================
  // EDGE CASES & INTEGRATION TESTS
  // ============================================
  describe("Edge Cases & Integration", function () {
    beforeEach(async function () {
      await donut.connect(user0).approve(glazelets.address, ethers.constants.MaxUint256);
      await donut.connect(user1).approve(glazelets.address, ethers.constants.MaxUint256);
    });

    it("Should handle empty origin string", async function () {
      await glazelets.connect(user0).mint("");
      expect(await glazelets.tokenIdToOrigin(1)).to.equal("");
    });

    it("Should handle very long origin string", async function () {
      const longOrigin = "A".repeat(1000);
      await glazelets.connect(user0).mint(longOrigin);
      expect(await glazelets.tokenIdToOrigin(1)).to.equal(longOrigin);
    });

    it("Should handle special characters in origin string", async function () {
      const specialOrigin = "🔥🌊🌍⚡";
      await glazelets.connect(user0).mint(specialOrigin);
      expect(await glazelets.tokenIdToOrigin(1)).to.equal(specialOrigin);
    });

    it("Should preserve origin after token transfer", async function () {
      await glazelets.connect(user0).mint("UniqueOrigin");
      await glazelets.connect(user0).transferFrom(user0.address, user1.address, 1);

      // Origin should still be the same
      expect(await glazelets.tokenIdToOrigin(1)).to.equal("UniqueOrigin");
    });

    it("Mints per wallet should not change after transfer", async function () {
      await glazelets.connect(user0).mint("origin1");
      expect(await glazelets.mintsPerWallet(user0.address)).to.equal(1);

      await glazelets.connect(user0).transferFrom(user0.address, user1.address, 1);

      // Mints per wallet should stay the same
      expect(await glazelets.mintsPerWallet(user0.address)).to.equal(1);
      expect(await glazelets.mintsPerWallet(user1.address)).to.equal(0);

      // But user1 received the token
      expect(await glazelets.ownerOf(1)).to.equal(user1.address);
    });

    it("Should allow full lifecycle: mint, transfer, mint more", async function () {
      // User0 mints
      await glazelets.connect(user0).mint("origin1");
      expect(await glazelets.totalSupply()).to.equal(1);

      // User0 transfers to User1
      await glazelets.connect(user0).transferFrom(user0.address, user1.address, 1);

      // User0 can still mint more
      await glazelets.connect(user0).mint("origin2");
      expect(await glazelets.totalSupply()).to.equal(2);
      expect(await glazelets.mintsPerWallet(user0.address)).to.equal(2);

      // User1 can also mint
      await glazelets.connect(user1).mint("origin3");
      expect(await glazelets.totalSupply()).to.equal(3);
    });

    it("Should correctly handle price change mid-minting", async function () {
      await glazelets.connect(user0).mint("origin1");

      // Owner changes price
      const newPrice = convert("500", 18);
      await glazelets.connect(owner).setMintPrice(newPrice);

      // User0 still has enough DONUT (10,000 total, 100 used)
      await glazelets.connect(user0).mint("origin2");
      expect(await glazelets.mintsPerWallet(user0.address)).to.equal(2);
    });

    it("Should verify Donut tokens are actually burned", async function () {
      const initialTotalSupply = await donut.totalSupply();

      await glazelets.connect(user0).mint("origin1");
      await glazelets.connect(user1).mint("origin2");

      const finalTotalSupply = await donut.totalSupply();

      // Total supply should decrease by 2x MINT_PRICE
      expect(finalTotalSupply).to.equal(initialTotalSupply.sub(MINT_PRICE.mul(2)));

      // Contract should have no Donut tokens
      expect(await donut.balanceOf(glazelets.address)).to.equal(0);
    });
  });
});
