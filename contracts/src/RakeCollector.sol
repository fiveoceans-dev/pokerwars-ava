// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title RakeCollector
 * @notice Lightweight splitter that forwards rake and jackpot slices to separate sink contracts/wallets.
 *         Table contracts call `contribute` with the gross amount; the collector pulls ERC20s and
 *         distributes according to configured BPS.
 */
contract RakeCollector is Ownable {
    using SafeERC20 for IERC20;

    address public rakeSink;
    address public jackpotSink;

    uint256 public rakeBps;     // e.g., 300 = 3%
    uint256 public jackpotBps;  // e.g., 100 = 1%
    uint256 public constant MAX_BPS = 2_000; // 20% safety cap per stream

    event RatesUpdated(uint256 rakeBps, uint256 jackpotBps);
    event SinksUpdated(address rakeSink, address jackpotSink);
    event Contributed(
        address indexed payer,
        address indexed token,
        uint256 rakeAmount,
        uint256 jackpotAmount,
        string gameType,
        string gameId
    );

    constructor(
        address _rakeSink,
        address _jackpotSink,
        uint256 _rakeBps,
        uint256 _jackpotBps,
        address initialOwner
    ) Ownable(initialOwner) {
        _setSinks(_rakeSink, _jackpotSink);
        _setRates(_rakeBps, _jackpotBps);
    }

    // ══════════════════════════════════════════════
    // ══ Admin config ══
    // ══════════════════════════════════════════════

    function updateRates(uint256 _rakeBps, uint256 _jackpotBps) external onlyOwner {
        _setRates(_rakeBps, _jackpotBps);
    }

    function updateSinks(address _rakeSink, address _jackpotSink) external onlyOwner {
        _setSinks(_rakeSink, _jackpotSink);
    }

    function _setRates(uint256 _rakeBps, uint256 _jackpotBps) internal {
        require(_rakeBps <= MAX_BPS && _jackpotBps <= MAX_BPS, "bps too high");
        rakeBps = _rakeBps;
        jackpotBps = _jackpotBps;
        emit RatesUpdated(_rakeBps, _jackpotBps);
    }

    function _setSinks(address _rakeSink, address _jackpotSink) internal {
        require(_rakeSink != address(0) && _jackpotSink != address(0), "zero sink");
        rakeSink = _rakeSink;
        jackpotSink = _jackpotSink;
        emit SinksUpdated(_rakeSink, _jackpotSink);
    }

    // ══════════════════════════════════════════════
    // ══ Contributions ══
    // ══════════════════════════════════════════════

    /**
     * @notice Pull tokens from payer and split to rake/jackpot sinks.
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

        IERC20 erc = IERC20(token);
        erc.safeTransferFrom(msg.sender, rakeSink, rakeAmount);
        erc.safeTransferFrom(msg.sender, jackpotSink, jackpotAmount);

        emit Contributed(msg.sender, token, rakeAmount, jackpotAmount, gameType, gameId);
    }
}
