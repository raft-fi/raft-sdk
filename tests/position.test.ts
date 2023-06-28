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

const mockEoaSigner = {
  provider: {
    getCode: () => Promise.resolve('0x'),
  },
  getAddress: () => Promise.resolve('0x123'),
} as unknown as Signer;

const EMPTY_SIGNATURE = createEmptyPermitSignature();

describe('UserPosition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  describe('getManageSteps', () => {
    it('should fetch whitelist and allowance if they are not passed and required', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
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
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
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
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
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

    it('should generate steps [approve wstETH + manage] for wstETH deposit + R borrowing in case of approval type config', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
      const steps = userPosition.getManageSteps(Decimal.ONE, Decimal.ONE, {
        collateralToken: 'wstETH',
        approvalType: 'approve',
      });

      const isDelegateWhitelistedMock = jest.fn().mockResolvedValue(false);

      jest.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);
      (createPermitSignature as jest.Mock).mockResolvedValue(EMPTY_SIGNATURE);

      const numberOfSteps = 2;

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual({
        name: 'approve',
        token: 'wstETH',
      });
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const secondStep = await steps.next();

      expect(secondStep.done).toBe(false);
      expect(secondStep.value?.type).toEqual('manage');
      expect(secondStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const termination = await steps.next();

      expect(termination.done).toBe(true);
    });

    it('should generate steps [wstETH permit + manage] for wstETH deposit + R repayment', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
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
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
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
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
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
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
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
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
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
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
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
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
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

    it('should generate steps [whitelist + manage] for ETH deposit + R borrowing', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
      const steps = userPosition.getManageSteps(Decimal.ONE, Decimal.ONE, { collateralToken: 'ETH' });

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

    it('should generate steps [whitelist + permit R + manage] for stETH deposit + R repayment', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
      const steps = userPosition.getManageSteps(Decimal.ONE, new Decimal(-1), { collateralToken: 'ETH' });

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

    it('should generate steps [whitelist + approve R + manage] for stETH deposit + R repayment in case of approval type config', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
      const steps = userPosition.getManageSteps(Decimal.ONE, new Decimal(-1), {
        collateralToken: 'ETH',
        approvalType: 'approve',
      });

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

      expect(secondStep.done).toBe(false);
      expect(secondStep.value?.type).toEqual({
        name: 'approve',
        token: 'R',
      });
      expect(secondStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const thirdStep = await steps.next();

      expect(thirdStep.done).toBe(false);
      expect(thirdStep.value?.type).toEqual('manage');
      expect(thirdStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const termination = await steps.next();

      expect(termination.done).toBe(true);
    });

    it('should throw an error for ETH withdrawal', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
      const steps = userPosition.getManageSteps(new Decimal(-1), Decimal.ZERO, { collateralToken: 'ETH' });

      const isDelegateWhitelistedMock = jest.fn().mockResolvedValue(false);

      jest.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);

      await steps.next();

      expect(() => steps.next()).rejects.toThrow('ETH withdrawal from the position is not supported');
    });

    it('should skip using delegate if there is no collateral change', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
      const steps = userPosition.getManageSteps(Decimal.ZERO, Decimal.ONE, { collateralToken: 'stETH' });

      const isDelegateWhitelistedMock = jest.fn().mockResolvedValue(false);

      jest.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).not.toEqual('whitelist');
    });

    it('should throw an error if collateral and debt changes are both zero', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
      const steps = userPosition.getManageSteps(Decimal.ZERO, Decimal.ZERO);

      expect(() => steps.next()).rejects.toThrow('Collateral and debt change cannot be both zero');
    });

    it('should throw an error if collateral token permit signature is not passed', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
      const steps = userPosition.getManageSteps(Decimal.ONE, Decimal.ONE, { collateralToken: 'wstETH' });

      const isDelegateWhitelistedMock = jest.fn().mockResolvedValue(false);

      jest.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);
      (createPermitSignature as jest.Mock).mockResolvedValue(EMPTY_SIGNATURE);

      await steps.next();

      expect(() => steps.next()).rejects.toThrow('stETH permit signature is required');
    });

    it('should throw an error if R token permit signature is not passed', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
      const steps = userPosition.getManageSteps(new Decimal(-1), new Decimal(-1), { collateralToken: 'stETH' });

      const isDelegateWhitelistedMock = jest.fn().mockResolvedValue(false);

      jest.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);
      (createPermitSignature as jest.Mock).mockResolvedValue(EMPTY_SIGNATURE);

      await steps.next();
      await steps.next();

      expect(() => steps.next()).rejects.toThrow('R permit signature is required');
    });
  });
});
