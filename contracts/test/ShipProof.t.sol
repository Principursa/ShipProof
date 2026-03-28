// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ShipProofTestHelper} from "./ShipProofTestHelper.sol";
import {ShipProof, AttestationMeta, MetricConfig, MAX_METRICS} from "../src/ShipProof.sol";
import {FHE, InEuint32, euint32} from "@fhenixprotocol/cofhe-contracts/FHE.sol";

contract ShipProofTest is ShipProofTestHelper {
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployShipProof(4000); // 40% threshold
    }

    // --- submitAttestation ---

    function test_submitAttestation_basic() public {
        bytes32 id = _submitAttestation(alice, 3, 100, 200, 5000, 1);
        (,,,,,,address wallet,,) = sp.attestations(id);
        assertEq(wallet, alice);
        assertTrue(sp.attestationState(id) == ShipProof.AttestationState.Submitted);
    }

    function test_submitAttestation_revert_notWallet() public {
        AttestationMeta memory meta = _makeMeta(alice, 2, 1);
        MetricConfig[] memory configs = _makeConfigs(2, 100, 5000);
        InEuint32[] memory inputs = _makeEncInputs(2, 50, alice);
        bytes memory sig = _signAttestation(meta, configs, inputs);

        vm.prank(bob);
        vm.expectRevert(ShipProof.NotWallet.selector);
        sp.submitAttestation(meta, configs, inputs, sig);
    }

    function test_submitAttestation_revert_zeroMetrics() public {
        AttestationMeta memory meta = _makeMeta(alice, 0, 1);
        MetricConfig[] memory configs = new MetricConfig[](0);
        InEuint32[] memory inputs = new InEuint32[](0);
        bytes memory sig = _signAttestation(meta, configs, inputs);

        vm.prank(alice);
        vm.expectRevert(ShipProof.InvalidMetricCount.selector);
        sp.submitAttestation(meta, configs, inputs, sig);
    }

    function test_submitAttestation_revert_tooManyMetrics() public {
        uint8 tooMany = MAX_METRICS + 1;
        AttestationMeta memory meta = _makeMeta(alice, tooMany, 1);
        MetricConfig[] memory configs = _makeConfigs(tooMany, 100, 5000);
        InEuint32[] memory inputs = _makeEncInputs(tooMany, 50, alice);
        bytes memory sig = _signAttestation(meta, configs, inputs);

        vm.prank(alice);
        vm.expectRevert(ShipProof.InvalidMetricCount.selector);
        sp.submitAttestation(meta, configs, inputs, sig);
    }

    function test_submitAttestation_revert_arrayMismatch() public {
        AttestationMeta memory meta = _makeMeta(alice, 3, 1);
        MetricConfig[] memory configs = _makeConfigs(2, 100, 5000);
        InEuint32[] memory inputs = _makeEncInputs(3, 50, alice);
        bytes memory sig = _signAttestation(meta, configs, inputs);

        vm.prank(alice);
        vm.expectRevert(ShipProof.ArrayLengthMismatch.selector);
        sp.submitAttestation(meta, configs, inputs, sig);
    }

    function test_submitAttestation_revert_zeroCap() public {
        AttestationMeta memory meta = _makeMeta(alice, 1, 1);
        MetricConfig[] memory configs = new MetricConfig[](1);
        configs[0] = MetricConfig({cap: 0, weight: 5000});
        InEuint32[] memory inputs = _makeEncInputs(1, 50, alice);
        bytes memory sig = _signAttestation(meta, configs, inputs);

        vm.prank(alice);
        vm.expectRevert(ShipProof.InvalidConfig.selector);
        sp.submitAttestation(meta, configs, inputs, sig);
    }

    function test_submitAttestation_revert_replayNonce() public {
        _submitAttestation(alice, 1, 50, 100, 5000, 1);

        AttestationMeta memory meta = _makeMeta(alice, 1, 1);
        MetricConfig[] memory configs = _makeConfigs(1, 100, 5000);
        InEuint32[] memory inputs = _makeEncInputs(1, 50, alice);
        bytes memory sig = _signAttestation(meta, configs, inputs);

        vm.prank(alice);
        vm.expectRevert(ShipProof.NonceAlreadyUsed.selector);
        sp.submitAttestation(meta, configs, inputs, sig);
    }

    function test_submitAttestation_revert_expired() public {
        AttestationMeta memory meta = _makeMeta(alice, 1, 1);
        meta.expiresAt = uint64(block.timestamp - 1);
        MetricConfig[] memory configs = _makeConfigs(1, 100, 5000);
        InEuint32[] memory inputs = _makeEncInputs(1, 50, alice);
        bytes memory sig = _signAttestation(meta, configs, inputs);

        vm.prank(alice);
        vm.expectRevert(ShipProof.AttestationExpired.selector);
        sp.submitAttestation(meta, configs, inputs, sig);
    }

    function test_submitAttestation_supersedes_identity() public {
        bytes32 id1 = _submitAttestation(alice, 1, 50, 100, 5000, 1);
        bytes32 id2 = _submitAttestation(alice, 1, 80, 100, 5000, 2);

        bytes32 identityHash = keccak256(abi.encodePacked("salt", alice));
        assertEq(sp.identityAttestation(identityHash), id2);
        assertTrue(id1 != id2);
    }
}
