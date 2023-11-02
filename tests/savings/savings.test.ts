import { JsonRpcProvider } from 'ethers';
import { describe, expect, it } from 'vitest';
import { Savings } from '../../src/savings';

const FORK_PROVIDER = new JsonRpcProvider('http://127.0.0.1:8545');

describe('Savings', () => {
  it.skipIf(process.env.CI !== 'true')('should fetch max deposit', async () => {
    const savings = new Savings(FORK_PROVIDER);
    const maxDeposit = await savings.maxDeposit();
    expect(maxDeposit.gt(0)).toBeTruthy();
  });

  it.skipIf(process.env.CI !== 'true')('should fetch TVL', async () => {
    const savings = new Savings(FORK_PROVIDER);
    const tvl = await savings.getTvl();
    expect(tvl.gt(0)).toBeTruthy();
  });

  it.skipIf(process.env.CI !== 'true')('should fetch yield reserve', async () => {
    const savings = new Savings(FORK_PROVIDER);
    const yieldReserve = await savings.getYieldReserve();
    expect(yieldReserve.gt(0)).toBeTruthy();
  });

  it.skipIf(process.env.CI !== 'true')('should fetch current yield', async () => {
    const savings = new Savings(FORK_PROVIDER);
    const currentYield = await savings.getCurrentYield();
    expect(currentYield.gt(0)).toBeTruthy();
  });
});
