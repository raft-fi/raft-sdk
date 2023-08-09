import { Decimal } from '@tempusfinance/decimal';
import { Provider } from 'ethers';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { getTokenContract } from '../src/utils';
import { Allowance } from '../src';

vi.mock('../src/utils', async () => ({
  ...(await vi.importActual<any>('../src/utils')),
  getTokenContract: vi.fn(),
}));

const mockProvider = {} as unknown as Provider;

describe('Allowance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  it('should fetch mocked allowance', async () => {
    const expectedAllowance = new Decimal(123);

    (getTokenContract as Mock).mockReturnValue({
      allowance: vi.fn().mockResolvedValue(expectedAllowance),
    });

    const allowance = new Allowance('R', '0x123', '0x456', mockProvider);

    const result = await allowance.fetchAllowance();
    expect(result).toEqual(expectedAllowance);
  });

  it('should return infinite allowance for ETH', async () => {
    (getTokenContract as Mock).mockReturnValue(null);

    const allowance = new Allowance('ETH', '0x123', '0x456', mockProvider);
    const result = await allowance.fetchAllowance();

    expect(result).toEqual(Decimal.MAX_DECIMAL);
  });
});
