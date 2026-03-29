// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ShipProofBadge} from "../src/ShipProofBadge.sol";

contract ShipProofBadgeTest is Test {
    ShipProofBadge badge;
    address shipProof = address(0xBEEF);
    address alice = address(0xA11CE);

    function setUp() public {
        badge = new ShipProofBadge(shipProof);
    }

    function test_mint_onlyShipProof() public {
        vm.prank(shipProof);
        uint256 tokenId = badge.mint(alice, bytes32(uint256(1)));
        assertEq(badge.ownerOf(tokenId), alice);
        assertEq(badge.tokenAttestation(tokenId), bytes32(uint256(1)));
    }

    function test_mint_revert_notShipProof() public {
        vm.prank(alice);
        vm.expectRevert(ShipProofBadge.OnlyShipProof.selector);
        badge.mint(alice, bytes32(uint256(1)));
    }

    function test_transfer_revert_soulbound() public {
        vm.prank(shipProof);
        uint256 tokenId = badge.mint(alice, bytes32(uint256(1)));

        vm.prank(alice);
        vm.expectRevert(ShipProofBadge.Soulbound.selector);
        badge.transferFrom(alice, address(0xB0B), tokenId);
    }

}
