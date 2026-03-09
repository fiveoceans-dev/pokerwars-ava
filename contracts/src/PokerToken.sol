// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PokerToken ($POKER)
 * @notice ERC-20 token with a hard cap of 5 billion tokens.
 */
contract PokerToken is ERC20, Ownable {
    uint256 public constant MAX_SUPPLY = 5_000_000_000 * 1e18; // 5 billion

    constructor(address initialOwner) ERC20("PokerWars", "POKER") Ownable(initialOwner) {}

    /**
     * @notice Mint new tokens. Only owner. Reverts if MAX_SUPPLY would be exceeded.
     */
    function mint(address to, uint256 amount) external onlyOwner {
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds max supply");
        _mint(to, amount);
    }
}
