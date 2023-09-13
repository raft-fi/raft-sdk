import { request } from 'graphql-request';
import { JsonRpcProvider } from 'ethers';
import { PriceFeed, TOKENS } from '../../src';
import { Decimal } from '@tempusfinance/decimal';

jest.mock('graphql-request', () => ({
  ...jest.requireActual('graphql-request'),
  request: jest.fn(),
}));

const describeWhen = (condition: boolean) => (condition ? describe : describe.skip);

const forkProvider = new JsonRpcProvider('http://127.0.0.1:8545');

describeWhen(process.env.CI === 'true')('PriceFeed', () => {
  describe('getPrice', () => {
    it('should return non-zero price for each token', async () => {
      (request as jest.Mock).mockRejectedValue(new Error('Failed to fetch price'));

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

  describe('getUnderlyingCollateralRate', () => {
    it('should return valid rate for wstETH:stETH', async () => {
      const priceFeed = new PriceFeed(forkProvider);
      const rate = await priceFeed.getUnderlyingCollateralRate('wstETH-v1', 'stETH');

      expect(rate.gt(1)).toBeTruthy();
      expect(rate.lt(2)).toBeTruthy();
    });

    it('should return 1:1 rate for wcrETH:rETH', async () => {
      const priceFeed = new PriceFeed(forkProvider);
      const rate = await priceFeed.getUnderlyingCollateralRate('wcrETH-v1', 'rETH-v1');

      expect(rate.equals(Decimal.ONE)).toBeTruthy();
    });
  });
});
