import { Decimal } from '@tempusfinance/decimal';
import { Signer } from 'ethers';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { ERC20PermitSignatureStruct, UserPosition, getTokenAllowance } from '../../src';
import { buildTransactionWithGasLimit, createPermitSignature, EMPTY_SIGNATURE } from '../../src/utils';

vi.mock('../../src/allowance', async () => ({
  ...(await vi.importActual<any>('../../src/allowance')),
  getTokenAllowance: vi.fn(),
}));

vi.mock('../../src/utils', async () => ({
  ...(await vi.importActual<any>('../../src/utils')),
  buildTransactionWithGasLimit: vi.fn(),
  createPermitSignature: vi.fn(),
}));

const mockEoaSigner = {
  provider: {
    getCode: () => Promise.resolve('0x'),
  },
  getAddress: () => Promise.resolve('0x123'),
} as unknown as Signer;

describe('UserPosition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  describe('getManageSteps', () => {
    it('should fetch whitelist and allowance if they are not passed and required', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
      const steps = userPosition.getManageSteps(Decimal.ONE, new Decimal(-1), { collateralToken: 'stETH' });

      const isDelegateWhitelistedMock = vi.fn().mockResolvedValue(false);

      vi.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as Mock).mockResolvedValue(Decimal.ZERO);
      (buildTransactionWithGasLimit as Mock).mockResolvedValue({
        sendTransaction: vi.fn(),
        gasEstimate: Decimal.ZERO,
        gasLimit: Decimal.ZERO,
      });

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

      const isDelegateWhitelistedMock = vi.fn().mockResolvedValue(false);

      vi.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as Mock).mockResolvedValue(Decimal.ZERO);
      (buildTransactionWithGasLimit as Mock).mockResolvedValue({
        sendTransaction: vi.fn(),
        gasEstimate: Decimal.ZERO,
        gasLimit: Decimal.ZERO,
      });

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value).toBeDefined();
      expect(isDelegateWhitelistedMock).not.toHaveBeenCalled();
      expect(getTokenAllowance).not.toHaveBeenCalled();
    });

    it('should generate steps [wstETH permit + manage] for wstETH deposit + R borrowing', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
      const steps = userPosition.getManageSteps(Decimal.ONE, Decimal.ONE, { collateralToken: 'wstETH' });

      const isDelegateWhitelistedMock = vi.fn().mockResolvedValue(false);

      vi.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as Mock).mockResolvedValue(Decimal.ZERO);
      (createPermitSignature as Mock).mockResolvedValue(EMPTY_SIGNATURE);
      (buildTransactionWithGasLimit as Mock).mockResolvedValue({
        sendTransaction: vi.fn(),
        gasEstimate: Decimal.ZERO,
        gasLimit: Decimal.ZERO,
      });

      const numberOfSteps = 2;

      const firstStep = await steps.next();
      const signature = await firstStep.value?.action?.();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual({
        name: 'permit',
        token: 'wstETH',
      });
      expect(firstStep.value?.stepNumber).toEqual(1);
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);
      expect(signature).toEqual(EMPTY_SIGNATURE);

      const secondStep = await steps.next(signature as ERC20PermitSignatureStruct);

      expect(secondStep.done).toBe(false);
      expect(secondStep.value?.type).toEqual({
        name: 'manage',
      });
      expect(secondStep.value?.stepNumber).toEqual(2);
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

      const isDelegateWhitelistedMock = vi.fn().mockResolvedValue(false);

      vi.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as Mock).mockResolvedValue(Decimal.ZERO);
      (createPermitSignature as Mock).mockResolvedValue(EMPTY_SIGNATURE);
      (buildTransactionWithGasLimit as Mock).mockResolvedValue({
        sendTransaction: vi.fn(),
        gasEstimate: Decimal.ZERO,
        gasLimit: Decimal.ZERO,
      });

      const numberOfSteps = 2;

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual({
        name: 'approve',
        token: 'wstETH',
      });
      expect(firstStep.value?.stepNumber).toEqual(1);
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const secondStep = await steps.next();

      expect(secondStep.done).toBe(false);
      expect(secondStep.value?.type).toEqual({
        name: 'manage',
      });
      expect(secondStep.value?.stepNumber);
      expect(secondStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const termination = await steps.next();

      expect(termination.done).toBe(true);
    });

    it('should generate steps [wstETH permit + manage] for wstETH deposit + R repayment', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
      const steps = userPosition.getManageSteps(Decimal.ONE, new Decimal(-1), { collateralToken: 'wstETH' });

      const isDelegateWhitelistedMock = vi.fn().mockResolvedValue(false);

      vi.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as Mock).mockResolvedValue(Decimal.ZERO);
      (createPermitSignature as Mock).mockResolvedValue(EMPTY_SIGNATURE);
      (buildTransactionWithGasLimit as Mock).mockResolvedValue({
        sendTransaction: vi.fn(),
        gasEstimate: Decimal.ZERO,
        gasLimit: Decimal.ZERO,
      });

      const numberOfSteps = 2;

      const firstStep = await steps.next();
      const signature = await firstStep.value?.action?.();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual({
        name: 'permit',
        token: 'wstETH',
      });
      expect(firstStep.value?.stepNumber).toEqual(1);
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);
      expect(signature).toEqual(EMPTY_SIGNATURE);

      const secondStep = await steps.next(signature as ERC20PermitSignatureStruct);

      expect(secondStep.done).toBe(false);
      expect(secondStep.value?.type).toEqual({
        name: 'manage',
      });
      expect(secondStep.value?.stepNumber);
      expect(secondStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const termination = await steps.next();

      expect(termination.done).toBe(true);
    });

    it('should generate steps [manage] for wstETH withdrawal + R borrowing', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
      const steps = userPosition.getManageSteps(new Decimal(-1), Decimal.ONE, { collateralToken: 'wstETH' });

      const isDelegateWhitelistedMock = vi.fn().mockResolvedValue(false);

      vi.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as Mock).mockResolvedValue(Decimal.ZERO);
      (buildTransactionWithGasLimit as Mock).mockResolvedValue({
        sendTransaction: vi.fn(),
        gasEstimate: Decimal.ZERO,
        gasLimit: Decimal.ZERO,
      });

      const numberOfSteps = 1;

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual({
        name: 'manage',
      });
      expect(firstStep.value?.stepNumber).toEqual(1);
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const termination = await steps.next();

      expect(termination.done).toBe(true);
    });

    it('should generate steps [manage] for wstETH withdrawal + R repayment', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
      const steps = userPosition.getManageSteps(new Decimal(-1), new Decimal(-1), { collateralToken: 'wstETH' });

      const isDelegateWhitelistedMock = vi.fn().mockResolvedValue(false);

      vi.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as Mock).mockResolvedValue(Decimal.ZERO);
      (buildTransactionWithGasLimit as Mock).mockResolvedValue({
        sendTransaction: vi.fn(),
        gasEstimate: Decimal.ZERO,
        gasLimit: Decimal.ZERO,
      });

      const numberOfSteps = 1;

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual({
        name: 'manage',
      });
      expect(firstStep.value?.stepNumber).toEqual(1);
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const termination = await steps.next();

      expect(termination.done).toBe(true);
    });

    it('should generate steps [whitelist + approve stETH + manage] for stETH deposit + R borrowing', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
      const steps = userPosition.getManageSteps(Decimal.ONE, Decimal.ONE, { collateralToken: 'stETH' });

      const isDelegateWhitelistedMock = vi.fn().mockResolvedValue(false);

      vi.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as Mock).mockResolvedValue(Decimal.ZERO);
      (buildTransactionWithGasLimit as Mock).mockResolvedValue({
        sendTransaction: vi.fn(),
        gasEstimate: Decimal.ZERO,
        gasLimit: Decimal.ZERO,
      });

      const numberOfSteps = 3;

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual({
        name: 'whitelist',
      });
      expect(firstStep.value?.stepNumber).toEqual(1);
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const secondStep = await steps.next();

      expect(secondStep.done).toBe(false);
      expect(secondStep.value?.type).toEqual({
        name: 'approve',
        token: 'stETH',
      });
      expect(secondStep.value?.stepNumber);
      expect(secondStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const thirdStep = await steps.next();

      expect(thirdStep.done).toBe(false);
      expect(thirdStep.value?.type).toEqual({
        name: 'manage',
      });
      expect(thirdStep.value?.stepNumber).toEqual(3);
      expect(thirdStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const termination = await steps.next();

      expect(termination.done).toBe(true);
    });

    it('should generate steps [whitelist + approve stETH + permit R + manage] for stETH deposit + R repayment', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
      const steps = userPosition.getManageSteps(Decimal.ONE, new Decimal(-1), { collateralToken: 'stETH' });

      const isDelegateWhitelistedMock = vi.fn().mockResolvedValue(false);

      vi.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as Mock).mockResolvedValue(Decimal.ZERO);
      (createPermitSignature as Mock).mockResolvedValue(EMPTY_SIGNATURE);
      (buildTransactionWithGasLimit as Mock).mockResolvedValue({
        sendTransaction: vi.fn(),
        gasEstimate: Decimal.ZERO,
        gasLimit: Decimal.ZERO,
      });

      const numberOfSteps = 4;

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual({
        name: 'whitelist',
      });
      expect(firstStep.value?.stepNumber).toEqual(1);
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const secondStep = await steps.next();

      expect(secondStep.done).toBe(false);
      expect(secondStep.value?.type).toEqual({
        name: 'approve',
        token: 'stETH',
      });
      expect(secondStep.value?.stepNumber);
      expect(secondStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const thirdStep = await steps.next();
      const signature = await thirdStep.value?.action?.();

      expect(thirdStep.done).toBe(false);
      expect(thirdStep.value?.type).toEqual({
        name: 'permit',
        token: 'R',
      });
      expect(thirdStep.value?.stepNumber).toEqual(3);
      expect(thirdStep.value?.numberOfSteps).toEqual(numberOfSteps);
      expect(signature).toEqual(EMPTY_SIGNATURE);

      const fourthStep = await steps.next(signature as ERC20PermitSignatureStruct);

      expect(fourthStep.done).toBe(false);
      expect(fourthStep.value?.type).toEqual({
        name: 'manage',
      });
      expect(fourthStep.value?.stepNumber).toEqual(4);
      expect(fourthStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const termination = await steps.next();

      expect(termination.done).toBe(true);
    });

    it('should generate steps [whitelist + manage] for stETH withdrawal + R borrowing', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
      const steps = userPosition.getManageSteps(new Decimal(-1), Decimal.ONE, { collateralToken: 'stETH' });

      const isDelegateWhitelistedMock = vi.fn().mockResolvedValue(false);

      vi.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as Mock).mockResolvedValue(Decimal.ZERO);
      (buildTransactionWithGasLimit as Mock).mockResolvedValue({
        sendTransaction: vi.fn(),
        gasEstimate: Decimal.ZERO,
        gasLimit: Decimal.ZERO,
      });

      const numberOfSteps = 2;

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual({
        name: 'whitelist',
      });
      expect(firstStep.value?.stepNumber).toEqual(1);
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const secondStep = await steps.next();

      expect(secondStep.done).toBe(false);
      expect(secondStep.value?.type).toEqual({
        name: 'manage',
      });
      expect(secondStep.value?.stepNumber);
      expect(secondStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const termination = await steps.next();

      expect(termination.done).toBe(true);
    });

    it('should generate steps [whitelist + permit R + manage] for stETH withdrawal + R repayment', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
      const steps = userPosition.getManageSteps(new Decimal(-1), new Decimal(-1), { collateralToken: 'stETH' });

      const isDelegateWhitelistedMock = vi.fn().mockResolvedValue(false);

      vi.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as Mock).mockResolvedValue(Decimal.ZERO);
      (createPermitSignature as Mock).mockResolvedValue(EMPTY_SIGNATURE);
      (buildTransactionWithGasLimit as Mock).mockResolvedValue({
        sendTransaction: vi.fn(),
        gasEstimate: Decimal.ZERO,
        gasLimit: Decimal.ZERO,
      });

      const numberOfSteps = 3;

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual({
        name: 'whitelist',
      });
      expect(firstStep.value?.stepNumber).toEqual(1);
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const secondStep = await steps.next();
      const signature = await secondStep.value?.action?.();

      expect(secondStep.done).toBe(false);
      expect(secondStep.value?.type).toEqual({
        name: 'permit',
        token: 'R',
      });
      expect(secondStep.value?.stepNumber);
      expect(secondStep.value?.numberOfSteps).toEqual(numberOfSteps);
      expect(signature).toEqual(EMPTY_SIGNATURE);

      const thirdStep = await steps.next(signature as ERC20PermitSignatureStruct);

      expect(thirdStep.done).toBe(false);
      expect(thirdStep.value?.type).toEqual({
        name: 'manage',
      });
      expect(thirdStep.value?.stepNumber).toEqual(3);
      expect(thirdStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const termination = await steps.next();

      expect(termination.done).toBe(true);
    });

    it('should skip using delegate if there is no collateral change', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
      const steps = userPosition.getManageSteps(Decimal.ZERO, Decimal.ONE, { collateralToken: 'stETH' });

      const isDelegateWhitelistedMock = vi.fn().mockResolvedValue(false);

      vi.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as Mock).mockResolvedValue(Decimal.ZERO);
      (buildTransactionWithGasLimit as Mock).mockResolvedValue({
        sendTransaction: vi.fn(),
        gasEstimate: Decimal.ZERO,
        gasLimit: Decimal.ZERO,
      });

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).not.toEqual({
        name: 'whitelist',
      });
    });

    it('should skip permit step if cached collateral token permit signature is passed', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
      const steps = userPosition.getManageSteps(Decimal.ONE, Decimal.ONE, {
        collateralToken: 'wstETH',
        collateralPermitSignature: EMPTY_SIGNATURE,
      });

      const isDelegateWhitelistedMock = vi.fn().mockResolvedValue(false);

      vi.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as Mock).mockResolvedValue(Decimal.ZERO);
      (createPermitSignature as Mock).mockResolvedValue(EMPTY_SIGNATURE);
      (buildTransactionWithGasLimit as Mock).mockResolvedValue({
        sendTransaction: vi.fn(),
        gasEstimate: Decimal.ZERO,
        gasLimit: Decimal.ZERO,
      });

      const numberOfSteps = 1;

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual({
        name: 'manage',
      });
      expect(firstStep.value?.stepNumber).toEqual(1);
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const termination = await steps.next();

      expect(termination.done).toBe(true);
    });

    it('should skip permit step if cached R token permit signature is passed', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
      const steps = userPosition.getManageSteps(new Decimal(-1), new Decimal(-1), {
        collateralToken: 'stETH',
        rPermitSignature: EMPTY_SIGNATURE,
      });

      const isDelegateWhitelistedMock = vi.fn().mockResolvedValue(false);

      vi.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as Mock).mockResolvedValue(Decimal.ZERO);
      (createPermitSignature as Mock).mockResolvedValue(EMPTY_SIGNATURE);
      (buildTransactionWithGasLimit as Mock).mockResolvedValue({
        sendTransaction: vi.fn(),
        gasEstimate: Decimal.ZERO,
        gasLimit: Decimal.ZERO,
      });

      const numberOfSteps = 2;

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual({
        name: 'whitelist',
      });
      expect(firstStep.value?.stepNumber).toEqual(1);
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const secondStep = await steps.next();

      expect(secondStep.done).toBe(false);
      expect(secondStep.value?.type).toEqual({
        name: 'manage',
      });
      expect(secondStep.value?.stepNumber).toEqual(2);
      expect(secondStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const termination = await steps.next();

      expect(termination.done).toBe(true);
    });

    it('should throw an error if collateral and debt changes are both zero', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
      const steps = userPosition.getManageSteps(Decimal.ZERO, Decimal.ZERO);

      expect(() => steps.next()).rejects.toThrow('Collateral and debt change cannot be both zero');
    });

    it('should throw an error if collateral token permit signature is not passed', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
      const steps = userPosition.getManageSteps(Decimal.ONE, Decimal.ONE, { collateralToken: 'wstETH' });

      const isDelegateWhitelistedMock = vi.fn().mockResolvedValue(false);

      vi.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as Mock).mockResolvedValue(Decimal.ZERO);
      (createPermitSignature as Mock).mockResolvedValue(EMPTY_SIGNATURE);

      await steps.next();

      expect(() => steps.next()).rejects.toThrow('stETH permit signature is required');
    });

    it('should throw an error if R token permit signature is not passed', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
      const steps = userPosition.getManageSteps(new Decimal(-1), new Decimal(-1), { collateralToken: 'stETH' });

      const isDelegateWhitelistedMock = vi.fn().mockResolvedValue(false);

      vi.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as Mock).mockResolvedValue(Decimal.ZERO);
      (createPermitSignature as Mock).mockResolvedValue(EMPTY_SIGNATURE);
      (buildTransactionWithGasLimit as Mock).mockResolvedValue({
        sendTransaction: vi.fn(),
        gasEstimate: Decimal.ZERO,
        gasLimit: Decimal.ZERO,
      });

      await steps.next();
      await steps.next();

      expect(() => steps.next()).rejects.toThrow('R permit signature is required');
    });
  });
});
