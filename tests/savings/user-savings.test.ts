import { Decimal } from '@tempusfinance/decimal';
import { Signer } from 'ethers';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { UserSavings } from '../../src/savings';
import { EMPTY_PERMIT_SIGNATURE, buildTransactionWithGasLimit, createPermitSignature } from '../../src/utils';
import { ERC20PermitSignatureStruct, getTokenAllowance } from '../../src';
import { RSavingsRate, RSavingsRate__factory } from '../../src/typechain';

vi.mock('../../src/allowance', async () => ({
  ...(await vi.importActual<typeof import('../../src/allowance')>('../../src/allowance')),
  getTokenAllowance: vi.fn(),
}));

vi.mock('../../src/utils/permit', async () => ({
  EMPTY_PERMIT_SIGNATURE: {},
  createPermitSignature: vi.fn(),
}));

vi.mock('../../src/utils/transactions', async () => ({
  ...(await vi.importActual<typeof import('../../src/utils/transactions')>('../../src/utils/transactions')),
  buildTransactionWithGasLimit: vi.fn(),
}));

const mockEoaSigner = {
  provider: {
    getCode: () => Promise.resolve('0x'),
  },
  getAddress: () => Promise.resolve('0x123'),
} as unknown as Signer;

describe('UserSavings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  describe('getManageSavingsSteps', () => {
    it('should generate steps [permit R + manage] for depositing', async () => {
      const savings = new UserSavings(mockEoaSigner);
      const steps = savings.getManageSavingsSteps(new Decimal(100));

      (getTokenAllowance as Mock).mockResolvedValue(Decimal.ZERO);
      (createPermitSignature as Mock).mockResolvedValue(EMPTY_PERMIT_SIGNATURE);
      (buildTransactionWithGasLimit as Mock).mockResolvedValue({
        sendTransaction: vi.fn(),
        gasEstimate: Decimal.ZERO,
      });

      const numberOfSteps = 2;

      const firstStep = await steps.next();
      const signature = await firstStep.value?.action?.();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual({
        name: 'permit',
        token: 'R',
      });
      expect(firstStep.value?.stepNumber).toEqual(1);
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);
      expect(signature).toEqual(EMPTY_PERMIT_SIGNATURE);

      const secondStep = await steps.next(signature as ERC20PermitSignatureStruct);

      expect(secondStep.done).toBe(false);
      expect(secondStep.value?.type).toEqual({
        name: 'manageSavings',
      });
      expect(secondStep.value?.stepNumber).toEqual(2);
      expect(secondStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const terminationStep = await steps.next();

      expect(terminationStep.done).toBe(true);
    });

    it('should generate steps [approve R + manage] for depositing if approval type is required', async () => {
      const savings = new UserSavings(mockEoaSigner);
      const steps = savings.getManageSavingsSteps(new Decimal(100), { approvalType: 'approve' });

      (getTokenAllowance as Mock).mockResolvedValue(Decimal.ZERO);
      (createPermitSignature as Mock).mockResolvedValue(EMPTY_PERMIT_SIGNATURE);
      (buildTransactionWithGasLimit as Mock).mockResolvedValue({
        sendTransaction: vi.fn(),
        gasEstimate: Decimal.ZERO,
      });

      const numberOfSteps = 2;

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual({
        name: 'approve',
        token: 'R',
      });
      expect(firstStep.value?.stepNumber).toEqual(1);
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const secondStep = await steps.next();

      expect(secondStep.done).toBe(false);
      expect(secondStep.value?.type).toEqual({
        name: 'manageSavings',
      });
      expect(secondStep.value?.stepNumber).toEqual(2);
      expect(secondStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const terminationStep = await steps.next();

      expect(terminationStep.done).toBe(true);
    });

    it('should generate steps [manage] for withdrawing', async () => {
      const savings = new UserSavings(mockEoaSigner);
      const steps = savings.getManageSavingsSteps(new Decimal(-100));
      const numberOfSteps = 1;

      (buildTransactionWithGasLimit as Mock).mockResolvedValue({
        sendTransaction: vi.fn(),
        gasEstimate: Decimal.ZERO,
        gasLimit: Decimal.ZERO,
      });

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual({
        name: 'manageSavings',
      });
      expect(firstStep.value?.stepNumber).toEqual(1);
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const terminationStep = await steps.next();

      expect(terminationStep.done).toBe(true);
    });
  });

  describe('currentSavings', () => {
    it('should return current savings', async () => {
      vi.spyOn(RSavingsRate__factory, 'connect').mockReturnValue({
        maxWithdraw: vi.fn().mockResolvedValue(100n * 10n ** 18n),
      } as unknown as RSavingsRate);

      const savings = new UserSavings(mockEoaSigner);
      const currentSavings = await savings.currentSavings();

      expect(currentSavings).toEqual(new Decimal(100));
    });
  });
});
