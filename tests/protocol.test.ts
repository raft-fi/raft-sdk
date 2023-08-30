import { Decimal } from '@tempusfinance/decimal';
import { Provider } from 'ethers';
import * as graphqlRequest from 'graphql-request';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { Protocol } from '../src';
import { getPositionManagerContract, getTokenContract } from '../src/utils';

vi.mock('graphql-request', async () => ({
  ...(await vi.importActual<typeof import('graphql-request')>('graphql-request')),
  request: vi.fn(),
}));

vi.mock('../src/utils', async () => ({
  ...(await vi.importActual<typeof import('../src/utils')>('../src/utils')),
  getTokenContract: vi.fn(),
  getPositionManagerContract: vi.fn(),
}));

const mockProvider = {} as unknown as Provider;

describe('Protocol', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  describe('fetchCollateralSupply', () => {
    it('should fetch mocked collateral supply per each token', async () => {
      (getTokenContract as Mock).mockImplementation((token: string) => ({
        totalSupply: () => (token === 'rwstETH-c' ? Promise.resolve(100n) : Promise.resolve(1n)),
      }));

      const protocol = Protocol.getInstance(mockProvider);

      expect(protocol.collateralSupply).toEqual({
        wstETH: null,
        wcrETH: null,
      });

      const collateralSupply = await protocol.fetchCollateralSupply();
      const expectedCollateralSupply = {
        wstETH: new Decimal(100n, Decimal.PRECISION),
        wcrETH: new Decimal(1n, Decimal.PRECISION),
      };

      expect(collateralSupply).toEqual(expectedCollateralSupply);
      expect(protocol.collateralSupply).toEqual(expectedCollateralSupply);
    });
  });

  describe('fetchDebtSupply', () => {
    it('should fetch mocked debt supply per each token', async () => {
      (getTokenContract as Mock).mockImplementation((token: string) => ({
        totalSupply: () => (token === 'rwstETH-d' ? Promise.resolve(100n) : Promise.resolve(1n)),
      }));

      const protocol = Protocol.getInstance(mockProvider);

      expect(protocol.debtSupply).toEqual({
        wstETH: null,
        wcrETH: null,
      });

      const debtSupply = await protocol.fetchDebtSupply();
      const expectedDebtSupply = {
        wstETH: new Decimal(100n, Decimal.PRECISION),
        wcrETH: new Decimal(1n, Decimal.PRECISION),
      };

      expect(debtSupply).toEqual(expectedDebtSupply);
      expect(protocol.debtSupply).toEqual(expectedDebtSupply);
    });
  });

  describe('fetchTokenTotalSupply', () => {
    it('should fetch mocked total supply for token', async () => {
      (getTokenContract as Mock).mockReturnValue({
        totalSupply: () => Promise.resolve(100n),
      });

      const protocol = Protocol.getInstance(mockProvider);

      expect(protocol.fetchTokenTotalSupply('stETH')).resolves.toEqual(new Decimal(100n, Decimal.PRECISION));
    });
  });

  describe('fetchBorrowingRate', () => {
    it('should fetch mocked borrowing rate per each token', async () => {
      (getPositionManagerContract as Mock).mockReturnValue({
        getBorrowingRate: () => Promise.resolve(10n ** 16n),
      });

      const protocol = Protocol.getInstance(mockProvider);

      expect(protocol.borrowingRate).toEqual({
        wstETH: null,
        wcrETH: null,
      });

      const borrowingRate = await protocol.fetchBorrowingRate();
      const expectedBorrowingRate = {
        wstETH: new Decimal(0.01),
        wcrETH: new Decimal(0.01),
      };

      expect(borrowingRate).toEqual(expectedBorrowingRate);
      expect(protocol.borrowingRate).toEqual(expectedBorrowingRate);
    });
  });

  describe('fetchOpenPositionCount', () => {
    it('should fetch mocked open position count', async () => {
      (graphqlRequest.request as Mock).mockResolvedValue({
        openPositionCounter: {
          count: 100,
        },
      });

      const protocol = Protocol.getInstance(mockProvider);

      expect(protocol.openPositionCount).toBeNull();

      const openPositionCount = await protocol.fetchOpenPositionCount();

      expect(openPositionCount).toEqual(100);
      expect(protocol.openPositionCount).toEqual(100);
    });
  });

  describe('fetchFlashMintFee', () => {
    it('should fetch mocked flash mint fee', async () => {
      (getTokenContract as Mock).mockReturnValue({
        flashMintFeePercentage: () => Promise.resolve(9n),
      });

      const protocol = Protocol.getInstance(mockProvider);

      expect(protocol.flashMintFee).toBeNull();

      const flashMintFee = await protocol.fetchFlashMintFee();

      expect(flashMintFee).toEqual(new Decimal(0.0009));
      expect(protocol.flashMintFee).toEqual(new Decimal(0.0009));
    });
  });

  describe('getPositionCollateralCap', () => {
    it('should get mocked position collateral cap', async () => {
      (getTokenContract as Mock).mockReturnValue({
        maxBalance: () => Promise.resolve(100n),
      });

      const protocol = Protocol.getInstance(mockProvider);

      expect(protocol.getPositionCollateralCap('rETH')).resolves.toEqual(new Decimal(100n, Decimal.PRECISION));
    });

    it('should return null if token is not supported', async () => {
      const protocol = Protocol.getInstance(mockProvider);

      expect(protocol.getPositionCollateralCap('stETH')).resolves.toBeNull();
    });
  });

  describe('getTotalCollateralCap', () => {
    it('should get mocked position collateral cap', async () => {
      (getTokenContract as Mock).mockReturnValue({
        cap: () => Promise.resolve(100n),
      });

      const protocol = Protocol.getInstance(mockProvider);

      expect(protocol.getTotalCollateralCap('rETH')).resolves.toEqual(new Decimal(100n, Decimal.PRECISION));
    });

    it('should return null if token is not supported', async () => {
      const protocol = Protocol.getInstance(mockProvider);

      expect(protocol.getTotalCollateralCap('stETH')).resolves.toBeNull();
    });
  });
});
