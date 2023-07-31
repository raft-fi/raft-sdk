import { Decimal } from '@tempusfinance/decimal';
import { Provider } from 'ethers';
import { getWstEthToStEthRate } from '../../src/price/rates';
import { getTokenContract } from '../../src/utils';

const mockProvider = {} as unknown as Provider;

jest.mock('../../src/utils', () => ({
  ...jest.requireActual('../../src/utils'),
  getTokenContract: jest.fn(),
}));

describe('getWstEthToStEthRate', () => {
  it('should return the correct rate', async () => {
    const expectedRate = 123n;

    (getTokenContract as jest.Mock).mockReturnValue({
      stEthPerToken: jest.fn().mockResolvedValue(expectedRate),
    });

    const rate = await getWstEthToStEthRate(mockProvider);
    expect(rate).toEqual(new Decimal(expectedRate, Decimal.PRECISION));
  });
});
