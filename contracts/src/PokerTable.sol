// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title PokerTable
 * @notice Core poker table contract for PokerWars on Avalanche.
 *         Manages buy-ins, pot distribution, and hand settlement.
 */
contract PokerTable {
    address public owner;
    uint256 public tableId;
    uint256 public minBuyIn;
    uint256 public maxBuyIn;
    uint8 public maxSeats;

    mapping(address => uint256) public playerBalances;
    address[] public seatedPlayers;

    event PlayerSeated(address indexed player, uint256 amount);
    event PlayerLeft(address indexed player, uint256 amount);
    event PotSettled(uint256 indexed handId, address[] winners, uint256[] amounts);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(
        uint256 _tableId,
        uint256 _minBuyIn,
        uint256 _maxBuyIn,
        uint8 _maxSeats
    ) {
        owner = msg.sender;
        tableId = _tableId;
        minBuyIn = _minBuyIn;
        maxBuyIn = _maxBuyIn;
        maxSeats = _maxSeats;
    }

    function seat() external payable {
        require(msg.value >= minBuyIn && msg.value <= maxBuyIn, "Invalid buy-in");
        require(playerBalances[msg.sender] == 0, "Already seated");
        require(seatedPlayers.length < maxSeats, "Table full");

        playerBalances[msg.sender] = msg.value;
        seatedPlayers.push(msg.sender);

        emit PlayerSeated(msg.sender, msg.value);
    }

    function leave() external {
        uint256 balance = playerBalances[msg.sender];
        require(balance > 0, "Not seated");

        playerBalances[msg.sender] = 0;
        _removePlayer(msg.sender);

        (bool sent, ) = msg.sender.call{value: balance}("");
        require(sent, "Transfer failed");

        emit PlayerLeft(msg.sender, balance);
    }

    function settlePot(
        uint256 handId,
        address[] calldata winners,
        uint256[] calldata amounts
    ) external onlyOwner {
        require(winners.length == amounts.length, "Length mismatch");

        for (uint256 i = 0; i < winners.length; i++) {
            playerBalances[winners[i]] += amounts[i];
        }

        emit PotSettled(handId, winners, amounts);
    }

    function getSeatedPlayers() external view returns (address[] memory) {
        return seatedPlayers;
    }

    function _removePlayer(address player) internal {
        uint256 len = seatedPlayers.length;
        for (uint256 i = 0; i < len; i++) {
            if (seatedPlayers[i] == player) {
                seatedPlayers[i] = seatedPlayers[len - 1];
                seatedPlayers.pop();
                return;
            }
        }
    }
}
