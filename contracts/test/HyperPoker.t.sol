// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { HyperPoker } from "../src/HyperPoker.sol";

contract HyperPokerTest is Test {
    HyperPoker internal poker;

    function setUp() public {
        poker = new HyperPoker();
    }

    function testCreateTable() public {
        uint256 id = poker.createTable(25, 50);
        assertEq(id, 1, "first table id should be 1");

        (address owner, uint64 sb, uint64 bb, bool active) = poker.getTable(id);
        assertEq(owner, address(this));
        assertEq(sb, 25);
        assertEq(bb, 50);
        assertTrue(active);
    }
}
