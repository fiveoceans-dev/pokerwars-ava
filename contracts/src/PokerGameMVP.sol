// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./PokerRNG.sol";

/**
 * @title PokerGameMVP
 * @notice Minimal on-chain dealer that produces a 5-card board using PokerRNG.
 *         Intended for demos/tests; not production-safe randomness.
 */
contract PokerGameMVP {
    PokerRNG public immutable rng;
    uint256 public lastHandId;
    mapping(uint256 => uint8[5]) public boards;

    event HandDealt(uint256 indexed handId, address indexed dealer, uint8[5] board);

    constructor(PokerRNG _rng) {
        rng = _rng;
    }

    /**
     * @notice Deal a 5-card community board.
     * @param salt User-supplied salt to mix into RNG.
     */
    function dealBoard(bytes32 salt) external returns (uint256 handId, uint8[5] memory board) {
        handId = ++lastHandId;
        uint8[] memory cards = rng.drawCards(keccak256(abi.encode(salt, handId, msg.sender)), 5);
        for (uint256 i = 0; i < 5; i++) {
            board[i] = cards[i];
        }
        boards[handId] = board;
        emit HandDealt(handId, msg.sender, board);
    }
}
