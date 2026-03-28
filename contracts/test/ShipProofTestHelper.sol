// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CoFheTest} from "@fhenixprotocol/cofhe-mock-contracts/CoFheTest.sol";
import {FHE, InEuint32, euint32, euint8, ebool} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {ShipProof, AttestationMeta, MetricConfig, MAX_METRICS} from "../src/ShipProof.sol";
import {ShipProofBadge} from "../src/ShipProofBadge.sol";

contract ShipProofTestHelper is Test, CoFheTest {
    uint256 internal oracleKey;
    address internal oracleAddr;
    ShipProof internal sp;
    ShipProofBadge internal spBadge;

    function _deployShipProof(uint32 threshold) internal {
        oracleKey = 0xA11CE;
        oracleAddr = vm.addr(oracleKey);
        spBadge = new ShipProofBadge(address(1));
        sp = new ShipProof(address(spBadge), threshold, oracleAddr);
        spBadge.setShipProof(address(sp));
    }

    function _makeConfigs(uint8 count, uint32 cap, uint32 weight)
        internal pure returns (MetricConfig[] memory configs)
    {
        configs = new MetricConfig[](count);
        for (uint8 i = 0; i < count; i++) {
            configs[i] = MetricConfig({cap: cap, weight: weight});
        }
    }

    function _makeEncInputs(uint8 count, uint32 value, address sender)
        internal returns (InEuint32[] memory inputs)
    {
        inputs = new InEuint32[](count);
        for (uint8 i = 0; i < count; i++) {
            inputs[i] = createInEuint32(value, sender);
        }
    }

    function _configHash(MetricConfig[] memory configs) internal pure returns (bytes32) {
        bytes memory packed;
        for (uint256 i = 0; i < configs.length; i++) {
            packed = abi.encodePacked(packed, abi.encode(configs[i].cap, configs[i].weight));
        }
        return keccak256(packed);
    }

    function _ctInputsHash(InEuint32[] memory inputs) internal pure returns (bytes32) {
        bytes memory packed;
        for (uint256 i = 0; i < inputs.length; i++) {
            packed = abi.encodePacked(packed, abi.encode(inputs[i]));
        }
        return keccak256(packed);
    }

    function _signAttestation(
        AttestationMeta memory meta,
        MetricConfig[] memory configs,
        InEuint32[] memory encInputs
    ) internal view returns (bytes memory sig) {
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
            _ctInputsHash(encInputs)
        ));

        bytes32 domainSep = sp.getDomainSeparator();
        bytes32 digest = MessageHashUtils.toTypedDataHash(domainSep, structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(oracleKey, digest);
        sig = abi.encodePacked(r, s, v);
    }

    function _makeMeta(
        address wallet,
        uint8 metricCount,
        uint64 nonce
    ) internal view returns (AttestationMeta memory) {
        return AttestationMeta({
            identityHash: keccak256(abi.encodePacked("salt", wallet)),
            fromTs: uint64(block.timestamp - 30 days),
            toTs: uint64(block.timestamp),
            metricCount: metricCount,
            metricsVersion: 1,
            scoringVersion: 1,
            wallet: wallet,
            oracleNonce: nonce,
            expiresAt: uint64(block.timestamp + 1 hours)
        });
    }

    function _submitAttestation(
        address wallet,
        uint8 metricCount,
        uint32 metricValue,
        uint32 cap,
        uint32 weight,
        uint64 nonce
    ) internal returns (bytes32 attestationId) {
        AttestationMeta memory meta = _makeMeta(wallet, metricCount, nonce);
        MetricConfig[] memory configs = _makeConfigs(metricCount, cap, weight);
        InEuint32[] memory encInputs = _makeEncInputs(metricCount, metricValue, wallet);
        bytes memory sig = _signAttestation(meta, configs, encInputs);

        vm.prank(wallet);
        attestationId = sp.submitAttestation(meta, configs, encInputs, sig);
    }
}
