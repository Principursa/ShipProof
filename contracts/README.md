# ShipProof Contracts

Stage 0 smoke test contract (`EncryptedStorage`) using Fhenix CoFHE. Will become the ShipProof core contract in Stage 1.

## Prerequisites

- [Foundry](https://getfoundry.sh/) (forge, cast, anvil)
- [Bun](https://bun.sh/)

## Setup

```bash
forge install fhenixprotocol/cofhe-contracts
forge install fhenixprotocol/cofhe-mock-contracts
forge install OpenZeppelin/openzeppelin-contracts
```

## Build

```bash
forge build
```

## Test

```bash
forge test -vvv
```

> **Note:** `isolate = true` in `foundry.toml` is required for CoFHE mock tests.

## Deploy

```bash
forge script contracts/script/EncryptedStorage.s.sol:EncryptedStorageScript \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc \
  --account shipproofkeystore \
  --broadcast
```

## Chain Config

| Field          | Value                                        |
|----------------|----------------------------------------------|
| Network        | Arbitrum Sepolia                             |
| Chain ID       | 421614                                       |
| RPC            | `https://sepolia-rollup.arbitrum.io/rpc`     |
| Block Explorer | `https://sepolia.arbiscan.io`                |
| Deployer       | `0x3b7cffc2bafaaefb8d6a74c5b156c7cf7097514d` |

## Faucets

- [Alchemy](https://www.alchemy.com/faucets)
- [Arbitrum](https://faucet.arbitrum.io/)

## Deployed Contract

`0x4bC7ba76cfAd5F2eBf3dD31d092C061e0E668069` ([view on Arbiscan](https://sepolia.arbiscan.io/address/0x4bC7ba76cfAd5F2eBf3dD31d092C061e0E668069))
