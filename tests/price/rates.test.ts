import { Decimal } from '@tempusfinance/decimal';
import { Provider } from 'ethers';
import { describe, expect, it, Mock, vi } from 'vitest';
import { getRRToRRate, getWstEthToStEthRate } from '../../src/price/rates';
import { getTokenContract } from '../../src/utils';

const mockProvider = {} as unknown as Provider;

vi.mock('../../src/utils', () => ({
  getTokenContract: vi.fn(),
}));

describe('getWstEthToStEthRate', () => {
  it('should return the correct rate', async () => {
    const expectedRate = 123n;

    (getTokenContract as Mock).mockReturnValue({
      stEthPerToken: vi.fn().mockResolvedValue(expectedRate),
    });

    const rate = await getWstEthToStEthRate(mockProvider);
    expect(rate).toEqual(new Decimal(expectedRate, Decimal.PRECISION));
  });
});

describe('getRRToRRate', () => {
  it('should return the correct rate', async () => {
    const expectedRate = 123n;

    (getTokenContract as Mock).mockReturnValue({
      convertToAssets: vi.fn().mockResolvedValue(expectedRate),
    });

    const rate = await getRRToRRate(mockProvider);
    expect(rate).toEqual(new Decimal(expectedRate, Decimal.PRECISION));
  });
});
