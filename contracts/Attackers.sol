// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IGlazelets {
    function mint(string memory _origin) external;
    function mintPrice() external view returns (uint256);
    function mintsPerWallet(address) external view returns (uint256);
    function MAX_MINT_PER_WALLET() external view returns (uint256);
    function balanceOf(address owner) external view returns (uint256);
    function donut() external view returns (address);
}

interface IERC721 {
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function totalSupply() external view returns (uint256);
}

/**
 * @title ReentrancyAttacker
 * @dev Attempts to exploit reentrancy in Glazelets.mint() via onERC721Received
 *
 * The attack attempts:
 * 1. _safeMint triggers onERC721Received on this contract
 * 2. We try to re-enter mint() before state is fully updated
 *
 * This should fail due to ReentrancyGuard
 */
contract ReentrancyAttacker {
    IGlazelets public glazelets;
    IERC20 public donut;
    uint256 public attackCount;
    uint256 public maxAttacks;

    constructor(address _glazelets) {
        glazelets = IGlazelets(_glazelets);
        donut = IERC20(glazelets.donut());
        maxAttacks = 10; // Try to mint 10 tokens
    }

    function attack() external {
        attackCount = 0;
        uint256 price = glazelets.mintPrice();

        // Approve Glazelets to spend our Donut tokens
        donut.approve(address(glazelets), type(uint256).max);

        // Start the attack
        glazelets.mint("attack");
    }

    // This is called by _safeMint
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external returns (bytes4) {
        attackCount++;

        // Try to re-enter
        if (attackCount < maxAttacks) {
            uint256 price = glazelets.mintPrice();
            if (donut.balanceOf(address(this)) >= price) {
                // Attempt to re-enter the mint function
                glazelets.mint("reentrant-attack");
            }
        }

        return this.onERC721Received.selector;
    }

    receive() external payable {}
}

/**
 * @title MintProxy
 * @dev Used to bypass per-wallet mint limits by deploying multiple proxy contracts
 */
contract MintProxy {
    IGlazelets public glazelets;
    IERC20 public donut;
    uint256 public lastTokenId;

    constructor(address _glazelets) {
        glazelets = IGlazelets(_glazelets);
        donut = IERC20(glazelets.donut());
    }

    function mintFor(address recipient, string memory origin) external {
        uint256 price = glazelets.mintPrice();

        // Transfer Donut from caller to this contract
        donut.transferFrom(msg.sender, address(this), price);

        // Approve Glazelets to spend Donut
        donut.approve(address(glazelets), price);

        // Mint to this contract first
        glazelets.mint(origin);

        // Transfer NFT to the actual recipient
        IERC721(address(glazelets)).safeTransferFrom(address(this), recipient, lastTokenId);
    }

    function onERC721Received(
        address,
        address,
        uint256 tokenId,
        bytes calldata
    ) external returns (bytes4) {
        lastTokenId = tokenId;
        return this.onERC721Received.selector;
    }

    receive() external payable {}
}
