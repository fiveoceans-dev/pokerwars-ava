// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title PokerRNG
 * @notice Lightweight, on-chain pseudo-RNG for MVP testing.
 *         NOT SECURE for mainnet-value games; replace with a VRF oracle for production.
 */
contract PokerRNG {
    /**
     * @notice Generate a pseudo-random uint256 using block data.
     * @dev Uses blockhash and prevrandao; susceptible to miner/validator influence.
     */
    function random(bytes32 salt) public view returns (uint256) {
        return uint256(
            keccak256(
                abi.encodePacked(
                    blockhash(block.number - 1),
                    block.prevrandao,
                    msg.sender,
                    salt,
                    block.timestamp
                )
            )
        );
    }

    /**
     * @notice Draw `cards` unique card indexes (0-51) representing a shuffled deck.
     * @dev Suitable only for MVP/local testing.
     */
    function drawCards(bytes32 salt, uint8 cards) external view returns (uint8[] memory) {
        require(cards > 0 && cards <= 52, "Invalid card count");

        bool[52] memory used;
        uint8[] memory drawn = new uint8[](cards);
        uint256 rand = random(salt);

        for (uint8 i = 0; i < cards; i++) {
            uint8 card = uint8(rand % 52);
            while (used[card]) {
                rand = uint256(keccak256(abi.encode(rand, i)));
                card = uint8(rand % 52);
            }
            used[card] = true;
            drawn[i] = card;
            rand = uint256(keccak256(abi.encode(rand, block.timestamp, i)));
        }

        return drawn;
    }
}
