import { Provider } from 'ethers';
import { describe, expect, it, Mock, vi } from 'vitest';
import { Protocol } from '../src';
import { getTokenContract } from '../src/utils';
import { Decimal } from '@tempusfinance/decimal';
import { beforeEach } from 'node:test';

vi.mock('../src/utils/token', async () => ({
  ...(await vi.importActual<any>('../src/utils/token')),
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
      (getTokenContract as Mock).mockImplementation(() => ({
        totalSupply: () => Promise.resolve(100n),
      }));

      const protocol = Protocol.getInstance(mockProvider);

      expect(protocol.fetchTokenTotalSupply('stETH')).resolves.toEqual(new Decimal(100n, Decimal.PRECISION));
    });
  });

  describe('getPositionCollateralCap', () => {
    it('should get mocked position collateral cap', async () => {
      (getTokenContract as Mock).mockImplementation(() => ({
        maxBalance: () => Promise.resolve(100n),
      }));

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
      (getTokenContract as Mock).mockImplementation(() => ({
        cap: () => Promise.resolve(100n),
      }));

      const protocol = Protocol.getInstance(mockProvider);

      expect(protocol.getTotalCollateralCap('rETH')).resolves.toEqual(new Decimal(100n, Decimal.PRECISION));
    });

    it('should return null if token is not supported', async () => {
      const protocol = Protocol.getInstance(mockProvider);

      expect(protocol.getTotalCollateralCap('stETH')).resolves.toBeNull();
    });
  });
});
