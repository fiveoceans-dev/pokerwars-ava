// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title RakeJackpotVault
 * @notice Collects rake and jackpot contributions from cash, SNG, and MTT tables.
 *         Admin can tune BPS splits and withdraw to treasury/jackpot wallets.
 */
contract RakeJackpotVault is Ownable {
    using SafeERC20 for IERC20;

    uint256 public rakeBps;     // e.g., 300 = 3%
    uint256 public jackpotBps;  // e.g., 100 = 1%
    uint256 public constant MAX_BPS = 1_000; // 10% safety cap per stream

    mapping(address => uint256) public rakeBalances;     // token => rake collected
    mapping(address => uint256) public jackpotBalances;  // token => jackpot collected

    event RatesUpdated(uint256 rakeBps, uint256 jackpotBps);
    event Contributed(address indexed token, uint256 rakeAmount, uint256 jackpotAmount, string gameType, string gameId);
    event Withdrawn(address indexed token, address indexed to, uint256 amount, bool isJackpot);

    constructor(uint256 _rakeBps, uint256 _jackpotBps, address initialOwner) Ownable(initialOwner) {
        _updateRates(_rakeBps, _jackpotBps);
    }

    // ══════════════════════════════════════════════
    // ══ Config ══
    // ══════════════════════════════════════════════

    function updateRates(uint256 _rakeBps, uint256 _jackpotBps) external onlyOwner {
        _updateRates(_rakeBps, _jackpotBps);
    }

    function _updateRates(uint256 _rakeBps, uint256 _jackpotBps) internal {
        require(_rakeBps <= MAX_BPS && _jackpotBps <= MAX_BPS, "bps too high");
        rakeBps = _rakeBps;
        jackpotBps = _jackpotBps;
        emit RatesUpdated(_rakeBps, _jackpotBps);
    }

    // ══════════════════════════════════════════════
    // ══ Contributions ══
    // ══════════════════════════════════════════════

    /**
     * @notice Table contracts call this to forward rake/jackpot from a buy-in or pot.
     * @param token ERC20 chip/token used.
     * @param amount Gross amount to levy percentages against.
     * @param gameType "cash", "sng", "mtt".
     * @param gameId Unique table/tournament identifier for off-chain audit.
     */
    function contribute(
        address token,
        uint256 amount,
        string calldata gameType,
        string calldata gameId
    ) external {
        require(amount > 0, "zero amount");
        uint256 rakeAmount = (amount * rakeBps) / 10_000;
        uint256 jackpotAmount = (amount * jackpotBps) / 10_000;
        uint256 total = rakeAmount + jackpotAmount;
        require(total > 0, "nothing to collect");

        IERC20(token).safeTransferFrom(msg.sender, address(this), total);
        rakeBalances[token] += rakeAmount;
        jackpotBalances[token] += jackpotAmount;

        emit Contributed(token, rakeAmount, jackpotAmount, gameType, gameId);
    }

    // ══════════════════════════════════════════════
    // ══ Withdrawals ══
    // ══════════════════════════════════════════════

    function withdrawRake(address token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "zero to");
        require(rakeBalances[token] >= amount, "insufficient rake");
        rakeBalances[token] -= amount;
        IERC20(token).safeTransfer(to, amount);
        emit Withdrawn(token, to, amount, false);
    }

    function withdrawJackpot(address token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "zero to");
        require(jackpotBalances[token] >= amount, "insufficient jackpot");
        jackpotBalances[token] -= amount;
        IERC20(token).safeTransfer(to, amount);
        emit Withdrawn(token, to, amount, true);
    }
}
