import { request } from 'graphql-request';
import { JsonRpcProvider } from 'ethers';
import { describe, expect, it, Mock, vi } from 'vitest';
import { PriceFeed, RAFT_BPT_TOKEN, RAFT_TOKEN, Token, TOKENS, VERAFT_TOKEN } from '../../src';
import { Decimal } from '@tempusfinance/decimal';

vi.mock('graphql-request', async () => ({
  ...(await vi.importActual<typeof import('graphql-request')>('graphql-request')),
  request: vi.fn(),
}));

const FORK_PROVIDER = new JsonRpcProvider('http://127.0.0.1:8545');
const NULL_PRICE_TOKENS = [RAFT_TOKEN, VERAFT_TOKEN, RAFT_BPT_TOKEN];
const NON_NULL_PRICE_TOKENS = TOKENS.filter(token => !NULL_PRICE_TOKENS.includes(token));

describe.skipIf(process.env.CI !== 'true')('PriceFeed', () => {
  describe('getPrice', () => {
    it.each(NON_NULL_PRICE_TOKENS)('should return non-zero price for %s', async token => {
      (request as Mock).mockRejectedValue(new Error('Failed to fetch price'));

      const priceFeed = new PriceFeed(FORK_PROVIDER);
      const price = await priceFeed.getPrice(token);
      expect(price.gt(0)).toBeTruthy();
    });

    it.each(NULL_PRICE_TOKENS)('should return zero price for %s', async token => {
      const priceFeed = new PriceFeed(FORK_PROVIDER);
      const price = await priceFeed.getPrice(token as unknown as Token);
      expect(price).toStrictEqual(Decimal.ZERO);
    });

    it('should return the same price for the same token', async () => {
      const priceFeed = new PriceFeed(FORK_PROVIDER);
      const price1 = await priceFeed.getPrice('wstETH');
      const price2 = await priceFeed.getPrice('wstETH');

      expect(price1).toEqual(price2);
    });
  });

  describe('getConversionRate', () => {
    it('should return valid rate for wstETH:stETH', async () => {
      const priceFeed = new PriceFeed(FORK_PROVIDER);
      const rate = await priceFeed.getConversionRate('stETH');

      expect(rate.gt(1)).toBeTruthy();
      expect(rate.lt(2)).toBeTruthy();
    });

    it('should return 1:1 rate for wcrETH:rETH', async () => {
      const priceFeed = new PriceFeed(FORK_PROVIDER);
      const rate = await priceFeed.getConversionRate('rETH-v1');

      expect(rate.equals(Decimal.ONE)).toBeTruthy();
    });
  });
});
