// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, InEuint32, euint32, euint8, ebool} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ShipProofBadge} from "./ShipProofBadge.sol";

uint8 constant MAX_METRICS = 16;

struct AttestationMeta {
    bytes32 identityHash;
    uint64  fromTs;
    uint64  toTs;
    uint8   metricCount;
    uint32  metricsVersion;
    uint32  scoringVersion;
    address wallet;
    uint64  oracleNonce;
    uint64  expiresAt;
}

struct MetricConfig {
    uint32 cap;
    uint32 weight;
}

contract ShipProof is Ownable, EIP712 {
    // --- Constants ---
    bytes32 public constant ATTESTATION_TYPEHASH = keccak256(
        "Attestation(bytes32 identityHash,uint64 fromTs,uint64 toTs,"
        "uint8 metricCount,uint32 metricsVersion,uint32 scoringVersion,"
        "address wallet,uint64 oracleNonce,uint64 expiresAt,"
        "bytes32 configHash,bytes32 ctInputsHash)"
    );

    // --- Enums ---
    enum AttestationState { None, Submitted, ScoreComputed, PassComputed, DecryptRequested, BadgeMinted }

    // --- Storage ---
    mapping(bytes32 => AttestationMeta) public attestations;
    mapping(bytes32 => AttestationState) public attestationState;
    mapping(bytes32 => euint32[16]) internal encMetrics;
    mapping(bytes32 => MetricConfig[16]) public metricConfigs;
    mapping(bytes32 => euint32) internal encScores;
    mapping(bytes32 => ebool)   internal encPassed;
    mapping(bytes32 => euint8)  internal encTiers;
    mapping(bytes32 => bool)    public   badgeMinted;
    mapping(bytes32 => bytes32) public   identityAttestation;
    mapping(bytes32 => bool)    public   nonceUsed; // key = keccak256(abi.encodePacked(signer, nonce))
    mapping(address => bool)    public   isOracle;

    euint32 internal ENC_SCALE;
    euint32 internal ENC_ZERO;
    euint32 internal ENC_THRESHOLD;

    ShipProofBadge public badge;

    // --- Events ---
    event Attested(bytes32 indexed attestationId, address indexed wallet,
                   uint8 metricCount, uint32 metricsVersion, uint32 scoringVersion);
    event ScoreComputed(bytes32 indexed attestationId);
    event PassComputed(bytes32 indexed attestationId);
    event TierComputed(bytes32 indexed attestationId);
    event DecryptionRequested(bytes32 indexed attestationId);
    event BadgeMinted(bytes32 indexed attestationId, address indexed to, uint8 tier);
    event ScoreAccessGranted(bytes32 indexed attestationId, address indexed grantee);
    event MetricAccessGranted(bytes32 indexed attestationId, uint8 slotIndex, address indexed grantee);

    // --- Errors ---
    error NotWallet();
    error InvalidMetricCount();
    error ArrayLengthMismatch();
    error InvalidConfig();
    error InvalidSignature();
    error NonceAlreadyUsed();
    error AttestationExpired();
    error WrongState(AttestationState expected, AttestationState actual);
    error AlreadyMinted();
    error DecryptionNotReady();
    error ScoreBelowThreshold();
    error InvalidSlot();

    constructor(
        address _badge,
        uint32 _threshold,
        address _oracle
    ) Ownable(msg.sender) EIP712("ShipProof", "1") {
        badge = ShipProofBadge(_badge);
        ENC_SCALE = FHE.asEuint32(10000);
        FHE.allowThis(ENC_SCALE);
        ENC_ZERO = FHE.asEuint32(0);
        FHE.allowThis(ENC_ZERO);
        ENC_THRESHOLD = FHE.asEuint32(_threshold);
        FHE.allowThis(ENC_THRESHOLD);
        isOracle[_oracle] = true;
    }

    // --- Admin ---
    function addOracle(address oracle) external onlyOwner {
        isOracle[oracle] = true;
    }

    function removeOracle(address oracle) external onlyOwner {
        isOracle[oracle] = false;
    }

    function updateThreshold(uint32 newThreshold) external onlyOwner {
        ENC_THRESHOLD = FHE.asEuint32(newThreshold);
        FHE.allowThis(ENC_THRESHOLD);
    }

    // --- Core ---
    function submitAttestation(
        AttestationMeta calldata meta,
        MetricConfig[] calldata configs,
        InEuint32[] calldata encInputs,
        bytes calldata oracleSig
    ) external returns (bytes32 attestationId) {
        if (msg.sender != meta.wallet) revert NotWallet();
        if (meta.metricCount < 1 || meta.metricCount > MAX_METRICS) revert InvalidMetricCount();
        if (configs.length != meta.metricCount || encInputs.length != meta.metricCount) revert ArrayLengthMismatch();

        // Validate configs
        for (uint8 i = 0; i < meta.metricCount; i++) {
            if (configs[i].cap == 0 || configs[i].weight == 0) revert InvalidConfig();
        }

        // Verify oracle signature
        bytes32 configHash = _hashConfigs(configs, meta.metricCount);
        bytes32 ctInputsHash = _hashCtInputs(encInputs, meta.metricCount);

        bytes32 structHash = keccak256(abi.encode(
            ATTESTATION_TYPEHASH,
            meta.identityHash,
            meta.fromTs,
            meta.toTs,
            meta.metricCount,
            meta.metricsVersion,
            meta.scoringVersion,
            meta.wallet,
            meta.oracleNonce,
            meta.expiresAt,
            configHash,
            ctInputsHash
        ));

        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, oracleSig);
        if (!isOracle[signer]) revert InvalidSignature();

        // Check nonce (signer-scoped)
        bytes32 nonceKey = keccak256(abi.encodePacked(signer, meta.oracleNonce));
        if (nonceUsed[nonceKey]) revert NonceAlreadyUsed();
        if (block.timestamp >= meta.expiresAt) revert AttestationExpired();

        // Generate attestation ID
        attestationId = keccak256(abi.encodePacked(meta.identityHash, meta.oracleNonce));

        // Store attestation
        attestations[attestationId] = meta;
        attestationState[attestationId] = AttestationState.Submitted;

        for (uint8 i = 0; i < meta.metricCount; i++) {
            euint32 enc = FHE.asEuint32(encInputs[i]);
            FHE.allowThis(enc);
            FHE.allow(enc, meta.wallet);
            encMetrics[attestationId][i] = enc;
            metricConfigs[attestationId][i] = configs[i];
        }

        // Mark nonce used
        nonceUsed[nonceKey] = true;

        // Update identity mapping (superseding model)
        identityAttestation[meta.identityHash] = attestationId;

        emit Attested(attestationId, meta.wallet, meta.metricCount, meta.metricsVersion, meta.scoringVersion);
    }

    function _hashConfigs(MetricConfig[] calldata configs, uint8 count) internal pure returns (bytes32) {
        bytes memory packed;
        for (uint8 i = 0; i < count; i++) {
            packed = abi.encodePacked(packed, abi.encode(configs[i].cap, configs[i].weight));
        }
        return keccak256(packed);
    }

    function _hashCtInputs(InEuint32[] calldata inputs, uint8 count) internal pure returns (bytes32) {
        bytes memory packed;
        for (uint8 i = 0; i < count; i++) {
            packed = abi.encodePacked(packed, abi.encode(inputs[i]));
        }
        return keccak256(packed);
    }

    // --- View helpers for tests ---
    function getDomainSeparator() public view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function getEncScore(bytes32 attestationId) external view returns (euint32) {
        return encScores[attestationId];
    }

    function getEncPassed(bytes32 attestationId) external view returns (ebool) {
        return encPassed[attestationId];
    }

    function getEncTier(bytes32 attestationId) external view returns (euint8) {
        return encTiers[attestationId];
    }

    function getEncMetric(bytes32 attestationId, uint8 slot) external view returns (euint32) {
        return encMetrics[attestationId][slot];
    }
}
