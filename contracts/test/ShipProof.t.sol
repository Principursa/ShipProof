// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ShipProofTestHelper} from "./ShipProofTestHelper.sol";
import {ShipProof, AttestationMeta, MetricConfig, MAX_METRICS} from "../src/ShipProof.sol";
import {FHE, InEuint32, euint32, euint8, ebool} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

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

    function test_submitAttestation_revert_zeroWeight() public {
        AttestationMeta memory meta = _makeMeta(alice, 1, 1);
        MetricConfig[] memory configs = new MetricConfig[](1);
        configs[0] = MetricConfig({cap: 100, weight: 0});
        InEuint32[] memory inputs = _makeEncInputs(1, 50, alice);
        bytes memory sig = _signAttestation(meta, configs, inputs);

        vm.prank(alice);
        vm.expectRevert(ShipProof.InvalidConfig.selector);
        sp.submitAttestation(meta, configs, inputs, sig);
    }

    function test_submitAttestation_revert_invalidSignature() public {
        AttestationMeta memory meta = _makeMeta(alice, 1, 1);
        MetricConfig[] memory configs = _makeConfigs(1, 100, 5000);
        InEuint32[] memory inputs = _makeEncInputs(1, 50, alice);

        // Sign with a random non-oracle key
        uint256 fakeKey = 0xDEAD;
        bytes32 structHash = keccak256(abi.encode(
            sp.ATTESTATION_TYPEHASH(),
            meta.identityHash,
            meta.fromTs,
            meta.toTs,
            meta.metricCount,
            meta.metricsVersion,
            meta.scoringVersion,
            meta.wallet,
            meta.oracleNonce,
            meta.expiresAt,
            _configHash(configs),
            _ctInputsHash(inputs)
        ));
        bytes32 digest = MessageHashUtils.toTypedDataHash(sp.getDomainSeparator(), structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(fakeKey, digest);
        bytes memory fakeSig = abi.encodePacked(r, s, v);

        vm.prank(alice);
        vm.expectRevert(ShipProof.InvalidSignature.selector);
        sp.submitAttestation(meta, configs, inputs, fakeSig);
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

    // --- computeScore ---

    function test_computeScore_singleMetric() public {
        // value=50, cap=100, weight=10000 → normalized = 50*10000/100 = 5000
        // score = 5000 * 10000 / 10000 = 5000
        bytes32 id = _submitAttestation(alice, 1, 50, 100, 10000, 1);
        vm.prank(alice);
        sp.computeScore(id);

        euint32 score = sp.getEncScore(id);
        assertHashValue(score, 5000);
    }

    function test_computeScore_capped() public {
        // value=200, cap=100, weight=10000 → capped to 100, normalized = 10000
        // score = 10000 * 10000 / 10000 = 10000
        bytes32 id = _submitAttestation(alice, 1, 200, 100, 10000, 1);
        vm.prank(alice);
        sp.computeScore(id);

        euint32 score = sp.getEncScore(id);
        assertHashValue(score, 10000);
    }

    function test_computeScore_multiMetric() public {
        // 2 metrics, each: value=50, cap=100, weight=5000
        // Each normalized = 5000, each weighted = 5000*5000 = 25000000
        // Sum = 50000000, totalWeight = 10000
        // score = 50000000 / 10000 = 5000
        bytes32 id = _submitAttestation(alice, 2, 50, 100, 5000, 1);
        vm.prank(alice);
        sp.computeScore(id);

        euint32 score = sp.getEncScore(id);
        assertHashValue(score, 5000);
    }

    function test_computeScore_revert_wrongState() public {
        bytes32 id = _submitAttestation(alice, 1, 50, 100, 10000, 1);
        vm.prank(alice);
        sp.computeScore(id);

        // Second call should revert (state is now ScoreComputed, not Submitted)
        vm.prank(alice);
        vm.expectRevert();
        sp.computeScore(id);
    }

    function test_computeScore_revert_notOwner() public {
        bytes32 id = _submitAttestation(alice, 1, 50, 100, 10000, 1);
        vm.prank(bob);
        vm.expectRevert(ShipProof.NotWallet.selector);
        sp.computeScore(id);
    }

    // --- computePass ---

    function test_computePass_passes() public {
        // score=5000 >= threshold=4000 → pass
        bytes32 id = _submitAttestation(alice, 1, 50, 100, 10000, 1);
        vm.prank(alice);
        sp.computeScore(id);
        vm.prank(alice);
        sp.computePass(id);
        assertTrue(sp.attestationState(id) == ShipProof.AttestationState.PassComputed);
    }

    function test_computePass_revert_wrongState() public {
        bytes32 id = _submitAttestation(alice, 1, 50, 100, 10000, 1);
        // Skip computeScore — state is Submitted, not ScoreComputed
        vm.prank(alice);
        vm.expectRevert();
        sp.computePass(id);
    }

    // --- Full lifecycle through computePass ---

    function test_lifecycle_submitToPass() public {
        bytes32 id = _submitAttestation(alice, 2, 75, 100, 5000, 1);

        vm.prank(alice);
        sp.computeScore(id);
        assertTrue(sp.attestationState(id) == ShipProof.AttestationState.ScoreComputed);

        vm.prank(alice);
        sp.computePass(id);
        assertTrue(sp.attestationState(id) == ShipProof.AttestationState.PassComputed);
    }

    function test_fullFlow_failingScore() public {
        // value=10, cap=100, weight=10000 → score=1000, threshold=4000 → fail
        bytes32 id = _submitAttestation(alice, 1, 10, 100, 10000, 1);

        vm.prank(alice);
        sp.computeScore(id);
        euint32 score = sp.getEncScore(id);
        assertHashValue(score, 1000);

        vm.prank(alice);
        sp.computePass(id);

        sp.publishPassDecryptResult(id, false, "");

        // Badge mint should revert — score below threshold
        vm.prank(alice);
        vm.expectRevert(ShipProof.ScoreBelowThreshold.selector);
        sp.mintBadge(id);
    }

    // --- Decryption & Badge ---

    function test_requestDecryption_and_mintBadge() public {
        // 75/100 = 7500 score, threshold 4000 → pass
        bytes32 id = _submitAttestation(alice, 1, 75, 100, 10000, 1);

        vm.startPrank(alice);
        sp.computeScore(id);
        sp.computePass(id);
        vm.stopPrank();

        sp.publishPassDecryptResult(id, true, "");

        vm.prank(alice);
        sp.mintBadge(id);

        assertTrue(sp.badgeMinted(id));
        assertTrue(sp.attestationState(id) == ShipProof.AttestationState.BadgeMinted);
        assertEq(spBadge.ownerOf(0), alice);
    }

    function test_mintBadge_revert_belowThreshold() public {
        // 10/100 = 1000 score, threshold 4000 → fail
        bytes32 id = _submitAttestation(alice, 1, 10, 100, 10000, 1);

        vm.startPrank(alice);
        sp.computeScore(id);
        sp.computePass(id);
        vm.stopPrank();

        sp.publishPassDecryptResult(id, false, "");

        vm.prank(alice);
        vm.expectRevert(ShipProof.ScoreBelowThreshold.selector);
        sp.mintBadge(id);
    }

    function test_mintBadge_revert_alreadyMinted() public {
        bytes32 id = _submitAttestation(alice, 1, 75, 100, 10000, 1);
        vm.startPrank(alice);
        sp.computeScore(id);
        sp.computePass(id);
        vm.stopPrank();

        sp.publishPassDecryptResult(id, true, "");

        vm.prank(alice);
        sp.mintBadge(id);

        // State is now BadgeMinted, so _requireState(DecryptRequested) will fail
        vm.prank(alice);
        vm.expectRevert();
        sp.mintBadge(id);
    }

    // --- Tier ---

    function test_computeTier_low() public {
        // 10/100 = 1000 → tier 0
        bytes32 id = _submitAttestation(alice, 1, 10, 100, 10000, 1);
        vm.prank(alice);
        sp.computeScore(id);
        vm.prank(alice);
        sp.computeTier(id);

        euint8 tier = sp.getEncTier(id);
        assertHashValue(tier, 0);
    }

    function test_computeTier_high() public {
        // 80/100 = 8000 → tier 3
        bytes32 id = _submitAttestation(alice, 1, 80, 100, 10000, 1);
        vm.prank(alice);
        sp.computeScore(id);
        vm.prank(alice);
        sp.computeTier(id);

        euint8 tier = sp.getEncTier(id);
        assertHashValue(tier, 3);
    }

    // --- Selective Disclosure ---

    function test_grantScoreAccess() public {
        bytes32 id = _submitAttestation(alice, 1, 50, 100, 10000, 1);
        vm.prank(alice);
        sp.computeScore(id);

        vm.prank(alice);
        sp.grantScoreAccess(id, bob);
        assertTrue(FHE.isAllowed(sp.getEncScore(id), bob));
    }

    function test_grantMetricAccess() public {
        bytes32 id = _submitAttestation(alice, 2, 50, 100, 10000, 1);

        vm.prank(alice);
        sp.grantMetricAccess(id, 0, bob);
        assertTrue(FHE.isAllowed(sp.getEncMetric(id, 0), bob));
    }

    function test_grantMetricAccess_revert_invalidSlot() public {
        bytes32 id = _submitAttestation(alice, 2, 50, 100, 10000, 1);

        vm.prank(alice);
        vm.expectRevert(ShipProof.InvalidSlot.selector);
        sp.grantMetricAccess(id, 5, bob);
    }

    function test_grantScoreAccess_revert_scoreNotComputed() public {
        // Submit but don't compute score — grantScoreAccess should revert
        bytes32 id = _submitAttestation(alice, 1, 50, 100, 10000, 1);

        vm.prank(alice);
        vm.expectRevert(ShipProof.ScoreNotComputed.selector);
        sp.grantScoreAccess(id, bob);
    }

    function test_grantAccess_revert_notOwner() public {
        bytes32 id = _submitAttestation(alice, 1, 50, 100, 10000, 1);
        vm.prank(alice);
        sp.computeScore(id);

        vm.prank(bob);
        vm.expectRevert(ShipProof.NotWallet.selector);
        sp.grantScoreAccess(id, bob);
    }

    // --- Gas Profiling ---

    function test_gasProfile_submit_1metric() public {
        _submitAttestation(alice, 1, 50, 100, 10000, 1);
    }

    function test_gasProfile_submit_5metrics() public {
        _submitAttestation(alice, 5, 50, 100, 2000, 1);
    }

    function test_gasProfile_submit_8metrics() public {
        _submitAttestation(alice, 8, 50, 100, 1250, 1);
    }

    function test_gasProfile_submit_16metrics() public {
        _submitAttestation(alice, 16, 50, 100, 625, 1);
    }

    function test_gasProfile_computeScore_1metric() public {
        bytes32 id = _submitAttestation(alice, 1, 50, 100, 10000, 1);
        vm.prank(alice);
        sp.computeScore(id);
    }

    function test_gasProfile_computeScore_5metrics() public {
        bytes32 id = _submitAttestation(alice, 5, 50, 100, 2000, 1);
        vm.prank(alice);
        sp.computeScore(id);
    }

    function test_gasProfile_computeScore_8metrics() public {
        bytes32 id = _submitAttestation(alice, 8, 50, 100, 1250, 1);
        vm.prank(alice);
        sp.computeScore(id);
    }

    function test_gasProfile_computeScore_16metrics() public {
        bytes32 id = _submitAttestation(alice, 16, 50, 100, 625, 1);
        vm.prank(alice);
        sp.computeScore(id);
    }

    function test_gasProfile_computePass() public {
        bytes32 id = _submitAttestation(alice, 1, 50, 100, 10000, 1);
        vm.prank(alice);
        sp.computeScore(id);
        vm.prank(alice);
        sp.computePass(id);
    }

    function test_gasProfile_decryptAndMint() public {
        bytes32 id = _submitAttestation(alice, 1, 75, 100, 10000, 1);
        vm.startPrank(alice);
        sp.computeScore(id);
        sp.computePass(id);
        vm.stopPrank();

        sp.publishPassDecryptResult(id, true, "");

        vm.prank(alice);
        sp.mintBadge(id);
    }
}
