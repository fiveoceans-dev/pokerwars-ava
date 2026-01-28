// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { HyperPoker } from "../src/HyperPoker.sol";

contract DeployHyperPoker is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);
        HyperPoker poker = new HyperPoker();
        vm.stopBroadcast();

        console2.log("HyperPoker deployed at", address(poker));
    }
}
