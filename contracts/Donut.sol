// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";

contract Donut is ERC20, ERC20Permit, ERC20Votes {
    address public immutable miner;

    error Donut__NotMiner();

    event Donut__Minted(address account, uint256 amount);
    event Donut__Burned(address account, uint256 amount);

    constructor() ERC20("Donut", "DONUT") ERC20Permit("Donut") {
        miner = msg.sender;
    }

    function mint(address account, uint256 amount) external {
        if (msg.sender != miner) revert Donut__NotMiner();
        _mint(account, amount);
        emit Donut__Minted(account, amount);
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
        emit Donut__Burned(msg.sender, amount);
    }

    function _afterTokenTransfer(address from, address to, uint256 amount) internal override(ERC20, ERC20Votes) {
        super._afterTokenTransfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal override(ERC20, ERC20Votes) {
        super._mint(to, amount);
    }

    function _burn(address account, uint256 amount) internal override(ERC20, ERC20Votes) {
        super._burn(account, amount);
    }
}
