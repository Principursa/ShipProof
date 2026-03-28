// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ShipProof} from "../src/ShipProof.sol";
import {ShipProofBadge} from "../src/ShipProofBadge.sol";

contract DeployShipProof is Script {
    function run() public {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address oracle = vm.envAddress("ORACLE_ADDRESS");
        uint32 threshold = uint32(vm.envOr("THRESHOLD", uint256(4000)));

        vm.startBroadcast(deployerKey);

        ShipProofBadge badge = new ShipProofBadge(address(1));
        ShipProof shipProof = new ShipProof(address(badge), threshold, oracle);
        badge.setShipProof(address(shipProof));

        console.log("ShipProofBadge:", address(badge));
        console.log("ShipProof:", address(shipProof));

        vm.stopBroadcast();
    }
}
