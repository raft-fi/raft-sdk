# Raft SDK

[![npm (tag)](https://img.shields.io/npm/v/@raft-fi/sdk)](https://www.npmjs.com/package/@raft-fi/sdk)
[![CI Tests](https://github.com/raft-fi/raft-sdk/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/raft-fi/raft-sdk/actions/workflows/ci.yml)
![npm bundle size (version)](https://img.shields.io/bundlephobia/minzip/@raft-fi/sdk)
![npm (downloads)](https://img.shields.io/npm/dm/@raft-fi/sdk)

Raft is an immutable, decentralized lending protocol that allows people to take out stablecoin loans against capital-efficient collateral.

R is the first Ethereum USD stablecoin solely backed by stETH (Lido Staked Ether). R provides the most capital-efficient way to borrow using your stETH. R aims to be the stablecoin of choice within the decentralized ecosystem, with deep liquidity across many trading pairs and a stable peg.

This repository contains the Raft SDK: a TypeScript-based library that provides a set of utilities for building applications using the [Raft protocol](https://raft.fi). It abstracts away the complexity of interacting with the [Raft smart contracts](https://github.com/raft-fi/raft-contracts), and provides a simple interface for interacting with the protocol.

## Quick Start

First of all, install the SDK:

```bash
npm install @raft-fi/sdk
# or
yarn add @raft-fi/sdk
```

Opening a position in Raft is as simple as the following:

```ts
import { Decimal } from "@tempusfinance/decimal";
import { UserPosition } from "@raft-fi/sdk";
import { Signer } from "ethers";

async function main() {
  const signer = new Signer(...);
  const position = new UserPosition(signer);
  await position.open(new Decimal(4.2), new Decimal(3000));
}
```

Closing the position is just as easy:

```ts
await position.close();
```

## Getting Started

### Prerequisites

To build and test the Raft SDK, you will need the following:

- [Node.js](https://nodejs.org/en/)
- [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vitejs.dev/)

### Installation

Clone the repository and install the dependencies via NPM:

```bash
npm install
```

### Building

To build the SDK, run the following command:

```bash
npm run build
```

## Community

Check out the following places for more Raft-related information and support:

- [Website](https://raft.fi)
- [Documentation](https://docs.raft.fi)
- [Twitter](https://twitter.com/raft_fi)
- [Discord](https://discord.com/invite/raft-fi)
- [Telegram](https://t.me/raft_fi)
