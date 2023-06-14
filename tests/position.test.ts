import { Decimal } from '@tempusfinance/decimal';
import { Signer } from 'ethers';
import { ERC20PermitSignatureStruct, UserPosition, getTokenAllowance } from '../src';
import { createEmptyPermitSignature, createPermitSignature } from '../src/utils';

jest.mock('../src/allowance', () => ({
  ...jest.requireActual('../src/allowance'),
  getTokenAllowance: jest.fn(),
}));

jest.mock('../src/utils/permit', () => ({
  ...jest.requireActual('../src/utils/permit'),
  createPermitSignature: jest.fn(),
}));

const EMPTY_SIGNATURE = createEmptyPermitSignature();

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
      (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);

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
      (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value).toBeDefined();
      expect(isDelegateWhitelistedMock).not.toHaveBeenCalled();
      expect(getTokenAllowance).not.toHaveBeenCalled();
    });

    it('should generate steps [wstETH permit + manage] for wstETH deposit + R borrowing', async () => {
      const signer = {
        getAddress: () => Promise.resolve('0x123'),
      } as Signer;
      const userPosition = new UserPosition(signer, Decimal.ZERO, Decimal.ZERO, 'wstETH');
      const steps = userPosition.getManageSteps(Decimal.ONE, Decimal.ONE, { collateralToken: 'wstETH' });

      const isDelegateWhitelistedMock = jest.fn().mockResolvedValue(false);

      jest.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);
      (createPermitSignature as jest.Mock).mockResolvedValue(EMPTY_SIGNATURE);

      const numberOfSteps = 2;

      const firstStep = await steps.next();
      const signature = await firstStep.value?.action?.();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual({
        name: 'permit',
        token: 'wstETH',
      });
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);
      expect(signature).toEqual(EMPTY_SIGNATURE);

      const secondStep = await steps.next(signature as ERC20PermitSignatureStruct);

      expect(secondStep.done).toBe(false);
      expect(secondStep.value?.type).toEqual('manage');
      expect(secondStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const termination = await steps.next();

      expect(termination.done).toBe(true);
    });

    it('should generate steps [wstETH permit + manage] for wstETH deposit + R repayment', async () => {
      const signer = {
        getAddress: () => Promise.resolve('0x123'),
      } as Signer;
      const userPosition = new UserPosition(signer, Decimal.ZERO, Decimal.ZERO, 'wstETH');
      const steps = userPosition.getManageSteps(Decimal.ONE, new Decimal(-1), { collateralToken: 'wstETH' });

      const isDelegateWhitelistedMock = jest.fn().mockResolvedValue(false);

      jest.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);
      (createPermitSignature as jest.Mock).mockResolvedValue(EMPTY_SIGNATURE);

      const numberOfSteps = 2;

      const firstStep = await steps.next();
      const signature = await firstStep.value?.action?.();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual({
        name: 'permit',
        token: 'wstETH',
      });
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);
      expect(signature).toEqual(EMPTY_SIGNATURE);

      const secondStep = await steps.next(signature as ERC20PermitSignatureStruct);

      expect(secondStep.done).toBe(false);
      expect(secondStep.value?.type).toEqual('manage');
      expect(secondStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const termination = await steps.next();

      expect(termination.done).toBe(true);
    });

    it('should generate steps [manage] for wstETH withdrawal + R borrowing', async () => {
      const signer = {
        getAddress: () => Promise.resolve('0x123'),
      } as Signer;
      const userPosition = new UserPosition(signer, Decimal.ZERO, Decimal.ZERO, 'wstETH');
      const steps = userPosition.getManageSteps(new Decimal(-1), Decimal.ONE, { collateralToken: 'wstETH' });

      const isDelegateWhitelistedMock = jest.fn().mockResolvedValue(false);

      jest.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);

      const numberOfSteps = 1;

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual('manage');
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const termination = await steps.next();

      expect(termination.done).toBe(true);
    });

    it('should generate steps [manage] for wstETH withdrawal + R repayment', async () => {
      const signer = {
        getAddress: () => Promise.resolve('0x123'),
      } as Signer;
      const userPosition = new UserPosition(signer, Decimal.ZERO, Decimal.ZERO, 'wstETH');
      const steps = userPosition.getManageSteps(new Decimal(-1), new Decimal(-1), { collateralToken: 'wstETH' });

      const isDelegateWhitelistedMock = jest.fn().mockResolvedValue(false);

      jest.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);

      const numberOfSteps = 1;

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual('manage');
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const termination = await steps.next();

      expect(termination.done).toBe(true);
    });

    it('should generate steps [whitelist + approve stETH + manage] for stETH deposit + R borrowing', async () => {
      const signer = {
        getAddress: () => Promise.resolve('0x123'),
      } as Signer;
      const userPosition = new UserPosition(signer, Decimal.ZERO, Decimal.ZERO, 'wstETH');
      const steps = userPosition.getManageSteps(Decimal.ONE, Decimal.ONE, { collateralToken: 'stETH' });

      const isDelegateWhitelistedMock = jest.fn().mockResolvedValue(false);

      jest.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);

      const numberOfSteps = 3;

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual('whitelist');
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const secondStep = await steps.next();

      expect(secondStep.done).toBe(false);
      expect(secondStep.value?.type).toEqual({
        name: 'approve',
        token: 'stETH',
      });
      expect(secondStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const thirdStep = await steps.next();

      expect(thirdStep.done).toBe(false);
      expect(thirdStep.value?.type).toEqual('manage');
      expect(thirdStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const termination = await steps.next();

      expect(termination.done).toBe(true);
    });

    it('should generate steps [whitelist + approve stETH + permit R + manage] for stETH deposit + R repayment', async () => {
      const signer = {
        getAddress: () => Promise.resolve('0x123'),
      } as Signer;
      const userPosition = new UserPosition(signer, Decimal.ZERO, Decimal.ZERO, 'wstETH');
      const steps = userPosition.getManageSteps(Decimal.ONE, new Decimal(-1), { collateralToken: 'stETH' });

      const isDelegateWhitelistedMock = jest.fn().mockResolvedValue(false);

      jest.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);
      (createPermitSignature as jest.Mock).mockResolvedValue(EMPTY_SIGNATURE);

      const numberOfSteps = 4;

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual('whitelist');
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const secondStep = await steps.next();

      expect(secondStep.done).toBe(false);
      expect(secondStep.value?.type).toEqual({
        name: 'approve',
        token: 'stETH',
      });
      expect(secondStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const thirdStep = await steps.next();
      const signature = await thirdStep.value?.action?.();

      expect(thirdStep.done).toBe(false);
      expect(thirdStep.value?.type).toEqual({
        name: 'permit',
        token: 'R',
      });
      expect(thirdStep.value?.numberOfSteps).toEqual(numberOfSteps);
      expect(signature).toEqual(EMPTY_SIGNATURE);

      const fourthStep = await steps.next(signature as ERC20PermitSignatureStruct);

      expect(fourthStep.done).toBe(false);
      expect(fourthStep.value?.type).toEqual('manage');
      expect(fourthStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const termination = await steps.next();

      expect(termination.done).toBe(true);
    });

    it('should generate steps [whitelist + manage] for stETH withdrawal + R borrowing', async () => {
      const signer = {
        getAddress: () => Promise.resolve('0x123'),
      } as Signer;
      const userPosition = new UserPosition(signer, Decimal.ZERO, Decimal.ZERO, 'wstETH');
      const steps = userPosition.getManageSteps(new Decimal(-1), Decimal.ONE, { collateralToken: 'stETH' });

      const isDelegateWhitelistedMock = jest.fn().mockResolvedValue(false);

      jest.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);

      const numberOfSteps = 2;

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual('whitelist');
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const secondStep = await steps.next();

      expect(secondStep.done).toBe(false);
      expect(secondStep.value?.type).toEqual('manage');
      expect(secondStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const termination = await steps.next();

      expect(termination.done).toBe(true);
    });

    it('should generate steps [whitelist + permit R + manage] for stETH withdrawal + R repayment', async () => {
      const signer = {
        getAddress: () => Promise.resolve('0x123'),
      } as Signer;
      const userPosition = new UserPosition(signer, Decimal.ZERO, Decimal.ZERO, 'wstETH');
      const steps = userPosition.getManageSteps(new Decimal(-1), new Decimal(-1), { collateralToken: 'stETH' });

      const isDelegateWhitelistedMock = jest.fn().mockResolvedValue(false);

      jest.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);
      (createPermitSignature as jest.Mock).mockResolvedValue(EMPTY_SIGNATURE);

      const numberOfSteps = 3;

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual('whitelist');
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const secondStep = await steps.next();
      const signature = await secondStep.value?.action?.();

      expect(secondStep.done).toBe(false);
      expect(secondStep.value?.type).toEqual({
        name: 'permit',
        token: 'R',
      });
      expect(secondStep.value?.numberOfSteps).toEqual(numberOfSteps);
      expect(signature).toEqual(EMPTY_SIGNATURE);

      const thirdStep = await steps.next(signature as ERC20PermitSignatureStruct);

      expect(thirdStep.done).toBe(false);
      expect(thirdStep.value?.type).toEqual('manage');
      expect(thirdStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const termination = await steps.next();

      expect(termination.done).toBe(true);
    });
  });
});
