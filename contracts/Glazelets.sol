// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./Donut.sol";

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
    Donut public immutable donut; // Donut token used for payment
    
    // Tracks how many tokens each wallet has minted
    mapping(address => uint256) public mintsPerWallet; 

    // Links a token ID to its unique "origin" string
    mapping(uint256 => string) public tokenIdToOrigin;

    // --- EVENTS ---
    event Glazelets__MintPriceChanged(uint256 oldPrice, uint256 newPrice);
    event Glazelets__BaseURIChanged(string newBaseURI);
    event Glazelets__Minted(uint256 indexed tokenId, address indexed to, string origin);

    // --- CONSTRUCTOR ---

    /**
     * @dev Sets the collection name, symbol, initial mint price, and Donut token address.
     * @param _initialPrice The initial price in Donut tokens for a single Glazelet.
     * @param _donut The address of the Donut token contract.
     */
    constructor(uint256 _initialPrice, address _donut)
        ERC721("CumDaddiesTest", "CDT")
    {
        mintPrice = _initialPrice;
        donut = Donut(_donut);
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


    // --- PUBLIC MINT FUNCTION ---

    /**
     * @dev Public mint function. Handles all checks and assigns the origin.
     * User must approve this contract to spend their Donut tokens first.
     * The Donut tokens are burned as payment.
     * @param _origin A string representing the Glazelet's origin.
     */
    function mint(string memory _origin) public nonReentrant {
        // 1. Check if the collection is sold out
        require(_tokenIdCounter.current() < MAX_SUPPLY, "GLZE: Collection sold out");

        // 2. Check the per-wallet limit
        require(mintsPerWallet[msg.sender] < MAX_MINT_PER_WALLET, "GLZE: Wallet limit reached (4)");

        // 3. Check user has enough Donut tokens
        require(donut.balanceOf(msg.sender) >= mintPrice, "GLZE: Insufficient DONUT balance");

        // 4. Transfer Donut tokens from user to this contract, then burn them
        require(donut.transferFrom(msg.sender, address(this), mintPrice), "GLZE: DONUT transfer failed");
        donut.burn(mintPrice);

        // Mint the token (token IDs start at 0)
        uint256 newTokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();

        _safeMint(msg.sender, newTokenId);

        // Assign the custom "origin" to the new token
        tokenIdToOrigin[newTokenId] = _origin;

        // Track the mint for the sender
        mintsPerWallet[msg.sender]++;

        emit Glazelets__Minted(newTokenId, msg.sender, _origin);
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
        
        // Concatenate the parts: baseURI + tokenId (converted to string)
        return string(abi.encodePacked(base, tokenId.toString()));
    }
    
    /**
     * @dev Returns the total number of Glazelets minted so far.
     */
    function totalSupply() public view returns (uint256) {
        return _tokenIdCounter.current();
    }
}