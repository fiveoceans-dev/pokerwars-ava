// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  table registry (placeholder)
/// @notice Stores simple table metadata while we wire the on-chain game engine.
contract HyperPoker {
    struct Table {
        address owner;
        uint64 smallBlind;
        uint64 bigBlind;
        bool active;
    }

    mapping(uint256 => Table) private _tables;
    uint256 public tableCount;

    event TableCreated(uint256 indexed tableId, address indexed owner, uint64 smallBlind, uint64 bigBlind);
    event TableStatusChanged(uint256 indexed tableId, bool active);

    function createTable(uint64 smallBlind, uint64 bigBlind) external returns (uint256 tableId) {
        require(smallBlind > 0 && bigBlind >= smallBlind * 2, "Invalid blinds");

        tableId = ++tableCount;
        _tables[tableId] = Table({ owner: msg.sender, smallBlind: smallBlind, bigBlind: bigBlind, active: true });

        emit TableCreated(tableId, msg.sender, smallBlind, bigBlind);
    }

    function setTableActive(uint256 tableId, bool active) external {
        Table storage table = _tables[tableId];
        require(table.owner != address(0), "Unknown table");
        require(table.owner == msg.sender, "Not table owner");

        table.active = active;
        emit TableStatusChanged(tableId, active);
    }

    function getTable(uint256 tableId) external view returns (Table memory) {
        Table memory table = _tables[tableId];
        require(table.owner != address(0), "Unknown table");
        return table;
    }
}
