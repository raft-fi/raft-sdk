import { Decimal } from '@tempusfinance/decimal';
import { Provider } from 'ethers';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { getTokenContract } from '../src/utils';
import { Balance } from '../src';

vi.mock('../src/utils', async () => ({
  ...(await vi.importActual<any>('../src/utils')),
  getTokenContract: vi.fn(),
}));

const mockProvider = {
  getBalance: () => Promise.resolve(Decimal.ONE),
} as unknown as Provider;

describe('Balance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  it('should fetch mocked allowance', async () => {
    const expectedAllowance = new Decimal(123);

    (getTokenContract as Mock).mockReturnValue({
      balanceOf: vi.fn().mockResolvedValue(expectedAllowance),
    });

    const allowance = new Balance('R', '0x123', mockProvider);

    const result = await allowance.fetchBalance();
    expect(result).toEqual(expectedAllowance);
  });

  it('should return mocked balance for ETH', async () => {
    (getTokenContract as Mock).mockReturnValue(null);

    const allowance = new Balance('ETH', '0x123', mockProvider);
    const result = await allowance.fetchBalance();

    expect(result).toEqual(Decimal.ONE);
  });
});
