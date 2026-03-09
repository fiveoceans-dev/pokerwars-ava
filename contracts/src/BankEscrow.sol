// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BankEscrow
 * @notice Handles player buy-ins for cash games, SNG, and MTT tournaments.
 *         Admins approve tokens and trigger payouts.
 */
contract BankEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── State ──
    mapping(address => bool) public admins;
    mapping(address => bool) public approvedTokens;
    
    // player => token => balance
    mapping(address => mapping(address => uint256)) public playerBalances;

    // ── Events ──
    event AdminAdded(address indexed admin);
    event AdminRemoved(address indexed admin);
    event TokenApproved(address indexed token);
    event TokenRevoked(address indexed token);
    event Deposited(address indexed player, address indexed token, uint256 amount, string gameType, string gameId);
    event Payout(address indexed player, address indexed token, uint256 amount, string gameType, string gameId);

    // ── Modifiers ──
    modifier onlyAdmin() {
        require(admins[msg.sender], "Not admin");
        _;
    }

    // ── Constructor ──
    constructor(address _initialAdmin, address _usdc) {
        require(_initialAdmin != address(0), "Zero admin");
        admins[_initialAdmin] = true;
        emit AdminAdded(_initialAdmin);

        // Approve USDC by default
        if (_usdc != address(0)) {
            approvedTokens[_usdc] = true;
            emit TokenApproved(_usdc);
        }
    }

    // ══════════════════════════════════════════════
    // ══ Admin Management ══
    // ══════════════════════════════════════════════

    function addAdmin(address account) external onlyAdmin {
        require(account != address(0), "Zero address");
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

    // ══════════════════════════════════════════════
    // ══ Token Management ══
    // ══════════════════════════════════════════════

    function approveToken(address token) external onlyAdmin {
        require(token != address(0), "Zero address");
        require(!approvedTokens[token], "Already approved");
        approvedTokens[token] = true;
        emit TokenApproved(token);
    }

    function revokeToken(address token) external onlyAdmin {
        require(approvedTokens[token], "Not approved");
        approvedTokens[token] = false;
        emit TokenRevoked(token);
    }

    // ══════════════════════════════════════════════
    // ══ Player Actions ══
    // ══════════════════════════════════════════════

    /**
     * @notice Player deposits tokens as buy-in for a game.
     * @param token The ERC20 token address
     * @param amount The amount to deposit
     * @param gameType "cash", "sng", or "mtt"
     * @param gameId Unique identifier for the game/tournament
     */
    function deposit(
        address token,
        uint256 amount,
        string calldata gameType,
        string calldata gameId
    ) external nonReentrant {
        require(approvedTokens[token], "Token not approved");
        require(amount > 0, "Zero amount");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        playerBalances[msg.sender][token] += amount;

        emit Deposited(msg.sender, token, amount, gameType, gameId);
    }

    // ══════════════════════════════════════════════
    // ══ Admin Payouts ══
    // ══════════════════════════════════════════════

    /**
     * @notice Admin triggers payout to a player (cash out or prize).
     * @param player The player receiving the payout
     * @param token The ERC20 token address
     * @param amount The amount to pay out
     * @param gameType "cash", "sng", or "mtt"
     * @param gameId Unique identifier for the game/tournament
     */
    function payout(
        address player,
        address token,
        uint256 amount,
        string calldata gameType,
        string calldata gameId
    ) external onlyAdmin nonReentrant {
        require(player != address(0), "Zero address");
        require(approvedTokens[token], "Token not approved");
        require(amount > 0, "Zero amount");
        
        uint256 contractBalance = IERC20(token).balanceOf(address(this));
        require(contractBalance >= amount, "Insufficient escrow balance");

        IERC20(token).safeTransfer(player, amount);

        // Reduce player's tracked balance (allow underflow protection)
        if (playerBalances[player][token] >= amount) {
            playerBalances[player][token] -= amount;
        } else {
            playerBalances[player][token] = 0;
        }

        emit Payout(player, token, amount, gameType, gameId);
    }

    /**
     * @notice Batch payout for tournament finishes (e.g., top 3 in SNG).
     */
    function batchPayout(
        address[] calldata players,
        address token,
        uint256[] calldata amounts,
        string calldata gameType,
        string calldata gameId
    ) external onlyAdmin nonReentrant {
        require(players.length == amounts.length, "Length mismatch");
        require(approvedTokens[token], "Token not approved");

        uint256 total = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            total += amounts[i];
        }
        
        uint256 contractBalance = IERC20(token).balanceOf(address(this));
        require(contractBalance >= total, "Insufficient escrow balance");

        for (uint256 i = 0; i < players.length; i++) {
            if (amounts[i] > 0 && players[i] != address(0)) {
                IERC20(token).safeTransfer(players[i], amounts[i]);
                
                if (playerBalances[players[i]][token] >= amounts[i]) {
                    playerBalances[players[i]][token] -= amounts[i];
                } else {
                    playerBalances[players[i]][token] = 0;
                }

                emit Payout(players[i], token, amounts[i], gameType, gameId);
            }
        }
    }

    // ══════════════════════════════════════════════
    // ══ View Functions ══
    // ══════════════════════════════════════════════

    function getPlayerBalance(address player, address token) external view returns (uint256) {
        return playerBalances[player][token];
    }

    function getEscrowBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }
}
