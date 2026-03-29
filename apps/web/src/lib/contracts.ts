import { env } from "@ShipProof/env/web";

export const SHIPPROOF_ADDRESS = (env.VITE_SHIPPROOF_CONTRACT_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

// Minimal ABI — only functions the frontend calls
export const shipProofAbi = [
  {
    type: "function",
    name: "submitAttestation",
    inputs: [
      {
        name: "meta",
        type: "tuple",
        components: [
          { name: "identityHash", type: "bytes32" },
          { name: "fromTs", type: "uint64" },
          { name: "toTs", type: "uint64" },
          { name: "metricCount", type: "uint8" },
          { name: "metricsVersion", type: "uint32" },
          { name: "scoringVersion", type: "uint32" },
          { name: "wallet", type: "address" },
          { name: "oracleNonce", type: "uint64" },
          { name: "expiresAt", type: "uint64" },
        ],
      },
      {
        name: "configs",
        type: "tuple[]",
        components: [
          { name: "cap", type: "uint32" },
          { name: "weight", type: "uint32" },
        ],
      },
      {
        name: "encInputs",
        type: "tuple[]",
        components: [
          { name: "ctHash", type: "uint256" },
          { name: "securityZone", type: "uint8" },
          { name: "utype", type: "uint8" },
          { name: "signature", type: "bytes" },
        ],
      },
      { name: "oracleSig", type: "bytes" },
    ],
    outputs: [{ name: "attestationId", type: "bytes32" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "computeScore",
    inputs: [{ name: "attestationId", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "computePass",
    inputs: [{ name: "attestationId", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "requestPassDecryption",
    inputs: [{ name: "attestationId", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "mintBadge",
    inputs: [{ name: "attestationId", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getEncPassed",
    inputs: [{ name: "attestationId", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "attestationState",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "badgeMinted",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "grantScoreAccess",
    inputs: [
      { name: "attestationId", type: "bytes32" },
      { name: "grantee", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "grantMetricAccess",
    inputs: [
      { name: "attestationId", type: "bytes32" },
      { name: "slotIndex", type: "uint8" },
      { name: "grantee", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "attestations",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [
      { name: "identityHash", type: "bytes32" },
      { name: "fromTs", type: "uint64" },
      { name: "toTs", type: "uint64" },
      { name: "metricCount", type: "uint8" },
      { name: "metricsVersion", type: "uint32" },
      { name: "scoringVersion", type: "uint32" },
      { name: "wallet", type: "address" },
      { name: "oracleNonce", type: "uint64" },
      { name: "expiresAt", type: "uint64" },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "Attested",
    inputs: [
      { name: "attestationId", type: "bytes32", indexed: true },
      { name: "wallet", type: "address", indexed: true },
      { name: "metricCount", type: "uint8", indexed: false },
      { name: "metricsVersion", type: "uint32", indexed: false },
      { name: "scoringVersion", type: "uint32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BadgeMinted",
    inputs: [
      { name: "attestationId", type: "bytes32", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "tier", type: "uint8", indexed: false },
    ],
  },
] as const;

// AttestationState enum matching the contract
export enum AttestationState {
  None = 0,
  Submitted = 1,
  ScoreComputed = 2,
  PassComputed = 3,
  DecryptRequested = 4,
  BadgeMinted = 5,
}
