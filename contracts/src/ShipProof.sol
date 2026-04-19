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

/// @title ShipProof — Confidential builder attestation with FHE-encrypted scoring
/// @notice Accepts oracle-attested encrypted metrics, computes scores on-chain via FHE,
///         and enables user-controlled selective disclosure to third parties.
///
/// @dev Handle-Authorization Model
/// ================================
/// Every encrypted value (euint32, euint8, ebool) is an FHE "handle". Handles require
/// explicit authorization before they can be used in computation or re-encrypted for viewing.
///
/// Authorization invariants:
///   1. The contract itself (`allowThis`) is authorized on ALL stored handles — required for
///      on-chain FHE operations (add, mul, div, select, gte, decrypt).
///   2. The attestation wallet (`FHE.allow(handle, wallet)`) is authorized on its own metrics,
///      score, pass result, and tier — enabling client-side unsealing via permits.
///   3. Third-party grantees receive authorization ONLY through explicit user action
///      (`grantScoreAccess`, `grantMetricAccess`). The owner and oracle never receive handle access.
///   4. Constants (ENC_SCALE, ENC_ZERO, ENC_THRESHOLD) are `allowThis`-only — no external
///      address ever needs to unseal these.
///
/// Trust boundary:
///   - Encrypted inputs (InEuint32) originate from the oracle and are bound to the attestation
///     envelope via EIP-712 signature over `ctInputsHash`. The contract cannot validate plaintext
///     values inside ciphertext — it trusts the oracle's signature.
///   - `FHE.asEuint32(InEuint32)` converts oracle-provided ciphertext into on-chain handles.
///     This does NOT verify the plaintext is within any range. Cap-and-normalize in `computeScore`
///     is defense-in-depth: even if raw values exceed caps, the scoring formula clamps them.
///   - `FHE.allow(handle, address)` grants re-encryption rights — the grantee can unseal the
///     value via a CoFHE permit. It does NOT grant on-chain compute rights (only `allowThis` does).
///   - `FHE.decrypt(handle)` initiates async decryption. Once complete, `getDecryptResultSafe`
///     returns plaintext — this value becomes PUBLIC to the calling contract. Used only for
///     the pass/fail boolean, never for scores or metrics.
///
/// State machine: None → Submitted → ScoreComputed → PassComputed → DecryptRequested → BadgeMinted
///   - Each transition is enforced by `_requireState` (exact match) or `>=` checks (computeTier).
///   - `computeTier` is a side-channel available after ScoreComputed; it does not advance the
///     main lifecycle and can be called at any point after scoring.
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
    /// @dev Authorized: allowThis + wallet. Grantees added via grantMetricAccess.
    mapping(bytes32 => euint32[16]) internal encMetrics;
    mapping(bytes32 => MetricConfig[16]) public metricConfigs;
    /// @dev Authorized: allowThis + wallet. Grantees added via grantScoreAccess.
    mapping(bytes32 => euint32) internal encScores;
    /// @dev Authorized: allowThis + wallet. Decrypted only via requestPassDecryption.
    mapping(bytes32 => ebool)   internal encPassed;
    /// @dev Authorized: allowThis + wallet. Side-channel computed via computeTier.
    mapping(bytes32 => euint8)  internal encTiers;
    mapping(bytes32 => bool)    public   badgeMinted;
    mapping(bytes32 => bytes32) public   identityAttestation;
    mapping(bytes32 => bool)    public   nonceUsed; // key = keccak256(abi.encodePacked(signer, nonce))
    mapping(address => bool)    public   isOracle;

    /// @dev Constants: allowThis-only, no external address is ever authorized.
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
    error ScoreNotComputed();

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

    /// @notice Submit an oracle-attested set of encrypted metrics.
    /// @dev Handle creation: converts each InEuint32 → euint32 via FHE.asEuint32().
    ///      Authorization: allowThis (for scoring) + allow(wallet) (for user unsealing).
    ///      Assumption: msg.sender == meta.wallet — prevents unauthorized envelope submission.
    ///      Assumption: oracle ciphertext is faithful — contract cannot inspect plaintext inside InEuint32.
    function submitAttestation(
        AttestationMeta calldata meta,
        MetricConfig[] calldata configs,
        InEuint32[] calldata encInputs,
        bytes calldata oracleSig
    ) external returns (bytes32 attestationId) {
        if (msg.sender != meta.wallet) revert NotWallet();
        if (meta.metricCount < 1 || meta.metricCount > MAX_METRICS) revert InvalidMetricCount();
        if (configs.length != meta.metricCount || encInputs.length != meta.metricCount) revert ArrayLengthMismatch();

        // Validate configs and total weight
        uint32 totalWeight = 0;
        for (uint8 i = 0; i < meta.metricCount; i++) {
            if (configs[i].cap == 0 || configs[i].weight == 0) revert InvalidConfig();
            uint32 prev = totalWeight;
            totalWeight += configs[i].weight;
            if (totalWeight < prev) revert InvalidConfig(); // overflow
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

        // Generate attestation ID (signer-scoped to prevent cross-oracle collisions)
        attestationId = keccak256(abi.encodePacked(meta.identityHash, signer, meta.oracleNonce));

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

    /// @notice Compute weighted normalized score from encrypted metrics.
    /// @dev Reads encMetrics handles (authorized via allowThis from submitAttestation).
    ///      Creates intermediate encrypted values for cap, weight, accumulation — these are
    ///      ephemeral and not stored. Final score handle: allowThis + allow(wallet).
    ///      All operations are constant-time per metric count — no branching on encrypted values.
    function computeScore(bytes32 attestationId) external returns (euint32) {
        _requireState(attestationId, AttestationState.Submitted);
        if (msg.sender != attestations[attestationId].wallet) revert NotWallet();

        AttestationMeta storage meta = attestations[attestationId];
        uint8 n = meta.metricCount;

        euint32 score = ENC_ZERO;

        for (uint8 i = 0; i < n; i++) {
            MetricConfig storage cfg = metricConfigs[attestationId][i];
            euint32 raw = encMetrics[attestationId][i];

            // Normalize: min(raw, cap) * SCALE / cap
            euint32 encCap = FHE.asEuint32(cfg.cap);
            euint32 capped = FHE.min(raw, encCap);
            euint32 scaled = FHE.mul(capped, ENC_SCALE);
            euint32 normalized = FHE.div(scaled, encCap);

            // Weight and accumulate
            euint32 encWeight = FHE.asEuint32(cfg.weight);
            euint32 weighted = FHE.mul(normalized, encWeight);
            score = FHE.add(score, weighted);
        }

        // Divide by total weight to get score in [0, 10000]
        uint32 totalWeight = 0;
        for (uint8 i = 0; i < n; i++) {
            totalWeight += metricConfigs[attestationId][i].weight;
        }
        euint32 encTotalWeight = FHE.asEuint32(totalWeight);
        score = FHE.div(score, encTotalWeight);

        encScores[attestationId] = score;
        FHE.allowThis(score);
        FHE.allow(score, meta.wallet);

        attestationState[attestationId] = AttestationState.ScoreComputed;
        emit ScoreComputed(attestationId);
        return score;
    }

    /// @notice Compare encrypted score against threshold to produce encrypted pass/fail.
    /// @dev Reads encScores handle (authorized via allowThis from computeScore).
    ///      Reads ENC_THRESHOLD (authorized via allowThis from constructor/updateThreshold).
    ///      Result handle: allowThis + allow(wallet). Never decrypted here — that's requestPassDecryption.
    function computePass(bytes32 attestationId) external returns (ebool) {
        _requireState(attestationId, AttestationState.ScoreComputed);
        if (msg.sender != attestations[attestationId].wallet) revert NotWallet();

        euint32 score = encScores[attestationId];
        ebool passed = FHE.gte(score, ENC_THRESHOLD);

        encPassed[attestationId] = passed;
        FHE.allowThis(passed);
        FHE.allow(passed, attestations[attestationId].wallet);

        attestationState[attestationId] = AttestationState.PassComputed;
        emit PassComputed(attestationId);
        return passed;
    }

    /// @notice Publish a CoFHE-signed decryption result for the pass/fail boolean.
    /// @dev Anyone can call this (relayer, frontend, coprocessor). The signature is verified
    ///      on-chain by the TaskManager against the CoFHE signer. The decrypted boolean
    ///      becomes readable via getDecryptResultSafe in mintBadge.
    function publishPassDecryptResult(
        bytes32 attestationId,
        bool result,
        bytes calldata signature
    ) external {
        _requireState(attestationId, AttestationState.PassComputed);

        ebool passed = encPassed[attestationId];
        FHE.publishDecryptResult(passed, result, signature);

        attestationState[attestationId] = AttestationState.DecryptRequested;
        emit DecryptionRequested(attestationId);
    }

    /// @notice Mint soulbound badge if decrypted pass result is true.
    /// @dev Reads decrypted plaintext from getDecryptResultSafe — no handle authorization needed
    ///      for reading plaintext. The tier emitted in the event is a placeholder (1); actual tier
    ///      is computed separately via computeTier and remains encrypted.
    function mintBadge(bytes32 attestationId) external {
        _requireState(attestationId, AttestationState.DecryptRequested);
        if (msg.sender != attestations[attestationId].wallet) revert NotWallet();
        if (badgeMinted[attestationId]) revert AlreadyMinted();

        address wallet = attestations[attestationId].wallet;
        ebool passed = encPassed[attestationId];
        (bool passedPlain, bool decrypted) = FHE.getDecryptResultSafe(passed);
        if (!decrypted) revert DecryptionNotReady();
        if (!passedPlain) revert ScoreBelowThreshold();

        badgeMinted[attestationId] = true;
        attestationState[attestationId] = AttestationState.BadgeMinted;
        badge.mint(wallet, attestationId);
        emit BadgeMinted(attestationId, wallet, 1);
    }

    /// @notice Compute encrypted tier (0-3) from score for granular disclosure.
    /// @dev Side-channel: does not advance main state machine. Reads encScores handle
    ///      (authorized via allowThis). Creates tier handle: allowThis + allow(wallet).
    ///      Tier thresholds are public policy (25%, 50%, 75%) — no information leaks from
    ///      the comparison count since all three comparisons always execute (constant-time).
    function computeTier(bytes32 attestationId) external returns (euint8) {
        if (attestationState[attestationId] < AttestationState.ScoreComputed) {
            revert WrongState(AttestationState.ScoreComputed, attestationState[attestationId]);
        }
        if (msg.sender != attestations[attestationId].wallet) revert NotWallet();

        euint32 score = encScores[attestationId];

        ebool gte25 = FHE.gte(score, FHE.asEuint32(2500));
        ebool gte50 = FHE.gte(score, FHE.asEuint32(5000));
        ebool gte75 = FHE.gte(score, FHE.asEuint32(7500));

        euint8 tier = FHE.asEuint8(0);
        tier = FHE.select(gte25, FHE.asEuint8(1), tier);
        tier = FHE.select(gte50, FHE.asEuint8(2), tier);
        tier = FHE.select(gte75, FHE.asEuint8(3), tier);

        encTiers[attestationId] = tier;
        FHE.allowThis(tier);
        FHE.allow(tier, attestations[attestationId].wallet);

        emit TierComputed(attestationId);
        return tier;
    }

    /// @notice Grant a third-party address permission to unseal the encrypted score.
    /// @dev Calls FHE.allow(scoreHandle, grantee). Requires score to exist (state >= ScoreComputed)
    ///      to prevent granting access to an uninitialized zero handle. Only the attestation wallet
    ///      can grant — the owner/oracle cannot share a user's score.
    function grantScoreAccess(bytes32 attestationId, address grantee) external {
        if (msg.sender != attestations[attestationId].wallet) revert NotWallet();
        if (attestationState[attestationId] < AttestationState.ScoreComputed) revert ScoreNotComputed();
        FHE.allow(encScores[attestationId], grantee);
        emit ScoreAccessGranted(attestationId, grantee);
    }

    /// @notice Grant a third-party address permission to unseal a specific encrypted metric.
    /// @dev Calls FHE.allow(metricHandle, grantee). Metric handles exist from submitAttestation,
    ///      so no additional state check needed — the slot bounds check is sufficient.
    function grantMetricAccess(bytes32 attestationId, uint8 slotIndex, address grantee) external {
        if (msg.sender != attestations[attestationId].wallet) revert NotWallet();
        if (slotIndex >= attestations[attestationId].metricCount) revert InvalidSlot();
        FHE.allow(encMetrics[attestationId][slotIndex], grantee);
        emit MetricAccessGranted(attestationId, slotIndex, grantee);
    }

    function _requireState(bytes32 attestationId, AttestationState expected) internal view {
        AttestationState actual = attestationState[attestationId];
        if (actual != expected) revert WrongState(expected, actual);
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
