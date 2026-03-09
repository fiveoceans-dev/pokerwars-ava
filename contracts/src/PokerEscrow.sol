// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IMintable {
    function mint(address to, uint256 amount) external;
}

/**
 * @title PokerEscrow
 * @notice Holds $POKER tokens. Admins can send tokens, issue new tokens to escrow,
 *         and manage the admin set.
 */
contract PokerEscrow {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    mapping(address => bool) public admins;

    event AdminAdded(address indexed admin);
    event AdminRemoved(address indexed admin);
    event TokensSent(address indexed to, uint256 amount);
    event TokensIssued(uint256 amount);

    modifier onlyAdmin() {
        require(admins[msg.sender], "Not admin");
        _;
    }

    constructor(address _token, address _initialAdmin) {
        token = IERC20(_token);
        admins[_initialAdmin] = true;
        emit AdminAdded(_initialAdmin);
    }

    // ── Admin management ──

    function addAdmin(address account) external onlyAdmin {
        require(!admins[account], "Already admin");
        admins[account] = true;
        emit AdminAdded(account);
    }

    function removeAdmin(address account) external onlyAdmin {
        require(account != msg.sender, "Cannot remove self");
        require(admins[account], "Not admin");
        admins[account] = false;
        emit AdminRemoved(account);
    }

    // ── Token operations ──

    /**
     * @notice Send tokens held by escrow to a recipient.
     */
    function sendTokens(address to, uint256 amount) external onlyAdmin {
        require(to != address(0), "Zero address");
        token.safeTransfer(to, amount);
        emit TokensSent(to, amount);
    }

    /**
     * @notice Mint new $POKER tokens directly into escrow.
     *         Requires PokerToken ownership to be transferred to this contract.
     */
    function issueToEscrow(uint256 amount) external onlyAdmin {
        IMintable(address(token)).mint(address(this), amount);
        emit TokensIssued(amount);
    }

    /**
     * @notice Current token balance held by escrow.
     */
    function balance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }
}
