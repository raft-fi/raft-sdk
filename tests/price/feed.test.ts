import { request } from 'graphql-request';
import { JsonRpcProvider } from 'ethers';
import { describe, expect, it, Mock, vi } from 'vitest';
import { PriceFeed, TOKENS } from '../../src';
import { Decimal } from '@tempusfinance/decimal';

vi.mock('graphql-request', async () => ({
  ...(await vi.importActual<typeof import('graphql-request')>('graphql-request')),
  request: vi.fn(),
}));

const forkProvider = new JsonRpcProvider('http://127.0.0.1:8545');

describe.skipIf(process.env.CI !== 'true')('PriceFeed', () => {
  describe('getPrice', () => {
    it('should return non-zero price for each token', async () => {
      (request as Mock).mockRejectedValue(new Error('Failed to fetch price'));

      for (const token of TOKENS) {
        const priceFeed = new PriceFeed(forkProvider);
        const price = await priceFeed.getPrice(token);
        expect(price.gt(0)).toBeTruthy();
      }
    });

    it('should return the same price for the same token', async () => {
      const priceFeed = new PriceFeed(forkProvider);
      const price1 = await priceFeed.getPrice('wstETH');
      const price2 = await priceFeed.getPrice('wstETH');

      expect(price1).toEqual(price2);
    });
  });

  describe('getConversionRate', () => {
    it('should return valid rate for wstETH:stETH', async () => {
      const priceFeed = new PriceFeed(forkProvider);
      const rate = await priceFeed.getConversionRate('stETH');

      expect(rate.gt(1)).toBeTruthy();
      expect(rate.lt(2)).toBeTruthy();
    });

    it('should return 1:1 rate for wcrETH:rETH', async () => {
      const priceFeed = new PriceFeed(forkProvider);
      const rate = await priceFeed.getConversionRate('rETH-v1');

      expect(rate.equals(Decimal.ONE)).toBeTruthy();
    });
  });
});
