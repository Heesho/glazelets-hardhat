// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title Glazelets
 * @dev ERC721 contract with custom minting logic and metadata handling.
 */
contract Glazelets is ERC721, Ownable, ReentrancyGuard {
    using Counters for Counters.Counter;
    using Strings for uint256;
    
    // --- CONFIGURATION CONSTANTS ---
    uint256 public constant MAX_SUPPLY = 808;
    uint256 public constant MAX_MINT_PER_WALLET = 4;

    // --- STATE VARIABLES ---
    Counters.Counter private _tokenIdCounter;
    uint256 public mintPrice;
    string private _baseTokenURI; // The root URL for your metadata (e.g., ipfs://<CID>/)
    
    // Tracks how many tokens each wallet has minted
    mapping(address => uint256) public mintsPerWallet; 

    // Links a token ID to its unique "origin" string
    mapping(uint256 => string) public tokenIdToOrigin;

    // --- EVENTS ---
    event Glazelets__MintPriceChanged(uint256 oldPrice, uint256 newPrice);
    event Glazelets__BaseURIChanged(string newBaseURI);
    event Glazelets__Withdrawal(address indexed to, uint256 amount);
    event Glazelets__Minted(uint256 indexed tokenId, address indexed to, string origin);

    // --- CONSTRUCTOR ---

    /**
     * @dev Sets the collection name, symbol, and initial mint price.
     * @param _initialPrice The initial price in Wei for a single Glazelet.
     */
    constructor(uint256 _initialPrice)
        ERC721("Glazelets", "GLZE")
    {
        mintPrice = _initialPrice;
    }

    // --- OWNER-ONLY FUNCTIONS (Access Control) ---

    /**
     * @dev Allows the contract owner to update the mint price.
     * @param _newPrice The new price in Wei.
     */
    function setMintPrice(uint256 _newPrice) public onlyOwner {
        uint256 oldPrice = mintPrice;
        mintPrice = _newPrice;
        emit Glazelets__MintPriceChanged(oldPrice, _newPrice);
    }

    /**
     * @dev Allows the contract owner to set the base URI for all tokens.
     * Example: "ipfs://Qmb87XyZ.../" (Note the trailing slash)
     */
    function setBaseURI(string calldata baseURI) public onlyOwner {
        _baseTokenURI = baseURI;
        emit Glazelets__BaseURIChanged(baseURI);
    }

    /**
     * @dev Allows the contract owner to withdraw accumulated ETH.
     */
    function withdraw() public onlyOwner {
        uint256 amount = address(this).balance;
        (bool success, ) = payable(owner()).call{value: amount}("");
        require(success, "Withdrawal failed");
        emit Glazelets__Withdrawal(owner(), amount);
    }

    // --- PUBLIC MINT FUNCTION ---

    /**
     * @dev Public mint function. Handles all checks and assigns the origin.
     * @param _origin A string representing the Glazelet's origin.
     */
    function mint(string memory _origin) public payable nonReentrant {
        // 1. Check if the collection is sold out
        require(_tokenIdCounter.current() < MAX_SUPPLY, "GLZE: Collection sold out");

        // 2. Check the per-wallet limit
        require(mintsPerWallet[msg.sender] < MAX_MINT_PER_WALLET, "GLZE: Wallet limit reached (4)");

        // 3. Check the payment amount
        require(msg.value >= mintPrice, "GLZE: Insufficient ETH sent");

        // Mint the token
        _tokenIdCounter.increment();
        uint256 newTokenId = _tokenIdCounter.current();

        _safeMint(msg.sender, newTokenId);
        
        // Assign the custom "origin" to the new token
        tokenIdToOrigin[newTokenId] = _origin;

        // Track the mint for the sender
        mintsPerWallet[msg.sender]++;

        emit Glazelets__Minted(newTokenId, msg.sender, _origin);

        // 4. Refund any excess ETH sent
        if (msg.value > mintPrice) {
            (bool success, ) = payable(msg.sender).call{value: msg.value - mintPrice}("");
            require(success, "GLZE: Refund failed");
        }
    }

    // --- OVERRIDES AND UTILITIES ---

    /**
     * @dev Required internal override to return the stored base URI.
     */
    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    /**
     * @dev Returns the full metadata URI for a given token ID.
     * Constructs the URL: baseURI + tokenId + ".json"
     */
    function tokenURI(uint256 tokenId)
        public
        view
        override
        returns (string memory)
    {
        require(_exists(tokenId), "ERC721Metadata: URI query for nonexistent token");
        
        string memory base = _baseURI();
        
        // Concatenate the parts: baseURI + tokenId (converted to string) + ".json"
        return string(abi.encodePacked(base, tokenId.toString(), ".json"));
    }
    
    /**
     * @dev Returns the total number of Glazelets minted so far.
     */
    function totalSupply() public view returns (uint256) {
        return _tokenIdCounter.current();
    }
}