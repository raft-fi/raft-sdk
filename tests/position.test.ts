import { Decimal } from '@tempusfinance/decimal';
import { Signer } from 'ethers';
import { UserPosition, getTokenAllowance } from '../src';

jest.mock('../src/allowance', () => ({
  ...jest.requireActual('../src/allowance'),
  getTokenAllowance: jest.fn(),
}));

describe('UserPosition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  describe('getManageSteps', () => {
    it('should fetch whitelist and allowance if they are not passed and required', async () => {
      const signer = {
        getAddress: () => Promise.resolve('0x123'),
      } as Signer;
      const userPosition = new UserPosition(signer, Decimal.ZERO, Decimal.ZERO, 'wstETH');
      const steps = userPosition.getManageSteps(Decimal.ONE, new Decimal(-1), { collateralToken: 'stETH' });

      const isDelegateWhitelistedMock = jest.fn().mockResolvedValue(false);

      jest.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as jest.Mock).mockResolvedValueOnce(Decimal.ZERO);

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value).toBeDefined();
      expect(isDelegateWhitelistedMock).toHaveBeenCalledTimes(1);
      expect(getTokenAllowance).toHaveBeenCalledTimes(2);
    });

    it('should skip whitelist and allowance fetching if they are passed', async () => {
      const signer = {
        getAddress: () => Promise.resolve('0x123'),
      } as Signer;
      const userPosition = new UserPosition(signer, Decimal.ZERO, Decimal.ZERO, 'wstETH');
      const steps = userPosition.getManageSteps(Decimal.ONE, Decimal.ONE, {
        isDelegateWhitelisted: false,
        collateralTokenAllowance: Decimal.ONE,
        rTokenAllowance: Decimal.ONE,
      });

      const isDelegateWhitelistedMock = jest.fn().mockResolvedValue(false);

      jest.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as jest.Mock).mockResolvedValueOnce(Decimal.ZERO);

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value).toBeDefined();
      expect(isDelegateWhitelistedMock).not.toHaveBeenCalled();
      expect(getTokenAllowance).not.toHaveBeenCalled();
    });

    it('should generate steps approve + manage for wstETH deposit + R borrowing', async () => {
      const signer = {
        getAddress: () => Promise.resolve('0x123'),
      } as Signer;
      const userPosition = new UserPosition(signer, Decimal.ZERO, Decimal.ZERO, 'wstETH');
      const steps = userPosition.getManageSteps(Decimal.ONE, new Decimal(-1), { collateralToken: 'wstETH' });

      const isDelegateWhitelistedMock = jest.fn().mockResolvedValue(false);

      jest.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as jest.Mock).mockResolvedValueOnce(Decimal.ZERO);

      const firstStep = await steps.next();
      const secondStep = await steps.next();
      const thirdStep = await steps.next();

      const numberOfSteps = 2;

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual({
        name: 'approve',
        token: 'wstETH',
      });
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);

      expect(secondStep.done).toBe(false);
      expect(secondStep.value?.type).toBeDefined();
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);

      expect(thirdStep.done).toBe(true);
    });
  });
});
