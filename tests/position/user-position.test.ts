import { Decimal } from '@tempusfinance/decimal';
import { Signer } from 'ethers';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { ERC20PermitSignatureStruct, UserPosition, getTokenAllowance } from '../../src';
import {
  buildTransactionWithGasLimit,
  createPermitSignature,
  EMPTY_PERMIT_SIGNATURE,
  getPositionManagerContract,
} from '../../src/utils';
import { CollateralToken, UnderlyingCollateralToken, VaultV1 } from '../../src/types';
import { getWstEthToStEthRate } from '../../src/price';
import { SWAP_ROUTER_MAX_SLIPPAGE } from '../../src/constants';
import { ERC20Indexable, ERC20Indexable__factory } from '../../src/typechain';

vi.mock('../../src/allowance', async () => ({
  ...(await vi.importActual<typeof import('../../src/allowance')>('../../src/allowance')),
  getTokenAllowance: vi.fn(),
}));

vi.mock('../../src/price/rates', async () => ({
  getWstEthToStEthRate: vi.fn(),
}));

vi.mock('../../src/utils/permit', async () => ({
  EMPTY_PERMIT_SIGNATURE: {},
  createPermitSignature: vi.fn(),
}));

vi.mock('../../src/utils/position-manager', async () => ({
  ...(await vi.importActual<typeof import('../../src/utils/position-manager')>('../../src/utils/position-manager')),
  getPositionManagerContract: vi.fn(),
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

describe('UserPosition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  describe('getManageSteps', () => {
    it('should fetch whitelist and allowance if they are not passed and required', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH-v1');
      const steps = userPosition.getManageSteps(Decimal.ONE, new Decimal(-1), { collateralToken: 'stETH' });

      const isDelegateWhitelistedMock = vi.fn().mockResolvedValue(false);

      vi.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as Mock).mockResolvedValue(Decimal.ZERO);
      (getPositionManagerContract as Mock).mockReturnValue({
        managePosition: null,
        whitelistDelegate: null,
      });
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
      (getPositionManagerContract as Mock).mockResolvedValue({
        managePosition: null,
      });
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
      (createPermitSignature as Mock).mockResolvedValue(EMPTY_PERMIT_SIGNATURE);
      (getPositionManagerContract as Mock).mockResolvedValue({
        managePosition: null,
      });
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
      expect(signature).toEqual(EMPTY_PERMIT_SIGNATURE);

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
      (createPermitSignature as Mock).mockResolvedValue(EMPTY_PERMIT_SIGNATURE);
      (getPositionManagerContract as Mock).mockReturnValue({
        managePosition: null,
        whitelistDelegate: null,
      });
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
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH-v1');
      const steps = userPosition.getManageSteps(Decimal.ONE, new Decimal(-1), { collateralToken: 'wstETH-v1' });

      const isDelegateWhitelistedMock = vi.fn().mockResolvedValue(false);

      vi.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as Mock).mockResolvedValue(Decimal.ZERO);
      (createPermitSignature as Mock).mockResolvedValue(EMPTY_PERMIT_SIGNATURE);
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
        token: 'wstETH-v1',
      });
      expect(firstStep.value?.stepNumber).toEqual(1);
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);
      expect(signature).toEqual(EMPTY_PERMIT_SIGNATURE);

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
      (getPositionManagerContract as Mock).mockResolvedValue({
        managePosition: null,
      });
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
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH-v1');
      const steps = userPosition.getManageSteps(new Decimal(-1), new Decimal(-1), { collateralToken: 'wstETH-v1' });

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

    it.each([
      ['wstETH-v1', 'stETH'],
      ['wcrETH-v1', 'rETH-v1'],
    ] as [VaultV1, 'stETH' | 'rETH-v1'][])(
      'should generate steps [whitelist + approve collateral + permit R + manage] for %s deposit + R repayment',
      async (underlyingCollateralToken: VaultV1, collateralToken: 'stETH' | 'rETH-v1') => {
        const userPosition = new UserPosition(mockEoaSigner, underlyingCollateralToken);
        const steps = userPosition.getManageSteps(Decimal.ONE, new Decimal(-1), {
          collateralToken,
        });

        const isDelegateWhitelistedMock = vi.fn().mockResolvedValue(false);

        vi.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
        (getTokenAllowance as Mock).mockResolvedValue(Decimal.ZERO);
        (createPermitSignature as Mock).mockResolvedValue(EMPTY_PERMIT_SIGNATURE);
        (getPositionManagerContract as Mock).mockReturnValue({
          managePosition: null,
          whitelistDelegate: null,
        });
        (buildTransactionWithGasLimit as Mock).mockResolvedValue({
          sendTransaction: vi.fn(),
          gasEstimate: Decimal.ZERO,
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
          token: collateralToken,
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
        expect(signature).toEqual(EMPTY_PERMIT_SIGNATURE);

        const fourthStep = await steps.next(signature as ERC20PermitSignatureStruct);

        expect(fourthStep.done).toBe(false);
        expect(fourthStep.value?.type).toEqual({
          name: 'manage',
        });
        expect(fourthStep.value?.stepNumber).toEqual(4);
        expect(fourthStep.value?.numberOfSteps).toEqual(numberOfSteps);

        const termination = await steps.next();

        expect(termination.done).toBe(true);
      },
    );

    it.each([
      ['wstETH-v1', 'stETH'],
      ['wcrETH-v1', 'rETH-v1'],
    ] as [VaultV1, 'stETH' | 'rETH-v1'][])(
      'should generate steps [whitelist + permit R + manage] for %s withdrawal + R repayment',
      async (underlyingCollateralToken: VaultV1, collateralToken: 'stETH' | 'rETH-v1') => {
        const userPosition = new UserPosition(mockEoaSigner, underlyingCollateralToken);
        const steps = userPosition.getManageSteps(new Decimal(-1), new Decimal(-1), {
          collateralToken,
        });

        const isDelegateWhitelistedMock = vi.fn().mockResolvedValue(false);

        vi.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
        (getTokenAllowance as Mock).mockResolvedValue(Decimal.ZERO);
        (createPermitSignature as Mock).mockResolvedValue(EMPTY_PERMIT_SIGNATURE);
        (getPositionManagerContract as Mock).mockReturnValue({
          managePosition: null,
          whitelistDelegate: null,
        });
        (buildTransactionWithGasLimit as Mock).mockResolvedValue({
          sendTransaction: vi.fn(),
          gasEstimate: Decimal.ZERO,
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
        expect(signature).toEqual(EMPTY_PERMIT_SIGNATURE);

        const thirdStep = await steps.next(signature as ERC20PermitSignatureStruct);

        expect(thirdStep.done).toBe(false);
        expect(thirdStep.value?.type).toEqual({
          name: 'manage',
        });
        expect(thirdStep.value?.stepNumber).toEqual(3);
        expect(thirdStep.value?.numberOfSteps).toEqual(numberOfSteps);

        const termination = await steps.next();

        expect(termination.done).toBe(true);
      },
    );

    it('should generate steps [approve collateral + manage] for WETH deposit + R borrowing', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'WETH');
      const steps = userPosition.getManageSteps(Decimal.ONE, Decimal.ONE, { collateralToken: 'WETH' });

      (getTokenAllowance as Mock).mockResolvedValue(Decimal.ZERO);
      (getPositionManagerContract as Mock).mockReturnValue({
        managePosition: null,
        whitelistDelegate: null,
      });
      (buildTransactionWithGasLimit as Mock).mockResolvedValue({
        sendTransaction: vi.fn(),
        gasEstimate: Decimal.ZERO,
      });

      const numberOfSteps = 2;

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual({
        name: 'approve',
        token: 'WETH',
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

    it('should generate steps [approve collateral + approve R + manage] for WETH deposit + R repayment', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'WETH');
      const steps = userPosition.getManageSteps(Decimal.ONE, new Decimal(-1), { collateralToken: 'WETH' });

      const isDelegateWhitelistedMock = vi.fn().mockResolvedValue(false);

      vi.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as Mock).mockResolvedValue(Decimal.ZERO);
      (createPermitSignature as Mock).mockResolvedValue(EMPTY_PERMIT_SIGNATURE);
      (getPositionManagerContract as Mock).mockReturnValue({
        managePosition: null,
        whitelistDelegate: null,
      });
      (buildTransactionWithGasLimit as Mock).mockResolvedValue({
        sendTransaction: vi.fn(),
        gasEstimate: Decimal.ZERO,
        gasLimit: Decimal.ZERO,
      });

      const numberOfSteps = 3;

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual({
        name: 'approve',
        token: 'WETH',
      });
      expect(firstStep.value?.stepNumber).toEqual(1);
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const secondsStep = await steps.next();

      expect(secondsStep.done).toBe(false);
      expect(secondsStep.value?.type).toEqual({
        name: 'approve',
        token: 'R',
      });
      expect(secondsStep.value?.stepNumber).toEqual(2);
      expect(secondsStep.value?.numberOfSteps).toEqual(numberOfSteps);

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

    it('should generate steps [manage] for WETH withdrawal + R borrowing', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'WETH');
      const steps = userPosition.getManageSteps(new Decimal(-1), Decimal.ONE, { collateralToken: 'WETH' });

      (getTokenAllowance as Mock).mockResolvedValue(Decimal.ZERO);
      (getPositionManagerContract as Mock).mockResolvedValue({
        managePosition: null,
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

    it('should generate steps [approve, manage] for WETH withdrawal + R repayment', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'WETH');
      const steps = userPosition.getManageSteps(new Decimal(-1), new Decimal(-1), { collateralToken: 'WETH' });

      (getTokenAllowance as Mock).mockResolvedValue(Decimal.ZERO);
      (getPositionManagerContract as Mock).mockReturnValue({
        managePosition: null,
        whitelistDelegate: null,
      });
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
        name: 'manage',
      });
      expect(secondStep.value?.stepNumber).toEqual(2);
      expect(secondStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const termination = await steps.next();

      expect(termination.done).toBe(true);
    });

    it('should skip using delegate if there is no collateral change', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH-v1');
      const steps = userPosition.getManageSteps(Decimal.ZERO, new Decimal(-1), { collateralToken: 'stETH' });

      const isDelegateWhitelistedMock = vi.fn().mockResolvedValue(false);

      vi.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as Mock).mockResolvedValue(Decimal.ZERO);
      (getPositionManagerContract as Mock).mockResolvedValue({
        managePosition: null,
      });
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
        collateralPermitSignature: EMPTY_PERMIT_SIGNATURE,
      });

      const isDelegateWhitelistedMock = vi.fn().mockResolvedValue(false);

      vi.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as Mock).mockResolvedValue(Decimal.ZERO);
      (createPermitSignature as Mock).mockResolvedValue(EMPTY_PERMIT_SIGNATURE);
      (getPositionManagerContract as Mock).mockResolvedValue({
        managePosition: null,
      });
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
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH-v1');
      const steps = userPosition.getManageSteps(new Decimal(-1), new Decimal(-1), {
        collateralToken: 'stETH',
        rPermitSignature: EMPTY_PERMIT_SIGNATURE,
      });

      const isDelegateWhitelistedMock = vi.fn().mockResolvedValue(false);

      vi.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as Mock).mockResolvedValue(Decimal.ZERO);
      (createPermitSignature as Mock).mockResolvedValue(EMPTY_PERMIT_SIGNATURE);
      (getPositionManagerContract as Mock).mockReturnValue({
        managePosition: null,
        whitelistDelegate: null,
      });
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
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH-v1');
      const steps = userPosition.getManageSteps(Decimal.ZERO, Decimal.ZERO);

      expect(() => steps.next()).rejects.toThrow('Collateral and debt change cannot be both zero');
    });

    it('should throw an error if collateral token permit signature is not passed', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
      const steps = userPosition.getManageSteps(Decimal.ONE, Decimal.ONE, { collateralToken: 'wstETH' });

      const isDelegateWhitelistedMock = vi.fn().mockResolvedValue(false);

      vi.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as Mock).mockResolvedValue(Decimal.ZERO);
      (createPermitSignature as Mock).mockResolvedValue(EMPTY_PERMIT_SIGNATURE);

      await steps.next();

      expect(() => steps.next()).rejects.toThrow('stETH permit signature is required');
    });

    it('should throw an error if R token permit signature is not passed', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH-v1');
      const steps = userPosition.getManageSteps(new Decimal(-1), new Decimal(-1), { collateralToken: 'stETH' });

      const isDelegateWhitelistedMock = vi.fn().mockResolvedValue(false);

      vi.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as Mock).mockResolvedValue(Decimal.ZERO);
      (createPermitSignature as Mock).mockResolvedValue(EMPTY_PERMIT_SIGNATURE);
      (getPositionManagerContract as Mock).mockReturnValue({
        managePosition: null,
        whitelistDelegate: null,
      });
      (buildTransactionWithGasLimit as Mock).mockResolvedValue({
        sendTransaction: vi.fn(),
        gasEstimate: Decimal.ZERO,
        gasLimit: Decimal.ZERO,
      });

      await steps.next();
      await steps.next();

      expect(() => steps.next()).rejects.toThrow('R permit signature is required');
    });

    it('should not allow opening a position for v1 vaults', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH-v1');
      const steps = userPosition.getManageSteps(Decimal.ONE, Decimal.ONE, { collateralToken: 'wstETH-v1' });

      await expect(steps.next()).rejects.toThrow('Cannot borrow more debt from v1 vaults');
    });

    it('should not allow borrowing more debt from v1 vaults', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH-v1', new Decimal(100), new Decimal(3000));
      const steps = userPosition.getManageSteps(Decimal.ZERO, new Decimal(100), { collateralToken: 'wstETH-v1' });

      await expect(steps.next()).rejects.toThrow('Cannot borrow more debt from v1 vaults');
    });
  });

  describe('getLeverageSteps', () => {
    it.each([
      ['wstETH' as CollateralToken, 'wstETH' as UnderlyingCollateralToken],
      ['stETH' as CollateralToken, 'wstETH' as UnderlyingCollateralToken],
    ])(
      'should generate steps [whitelist + approve + leverage] for %s leveraging',
      async (collateralToken, underlyingCollateralToken) => {
        const isDelegateWhitelistedMock = vi.fn().mockResolvedValue(false);
        const getWstEthToStEthRateMock = vi.fn().mockResolvedValue(new Decimal(1.1));

        vi.spyOn(ERC20Indexable__factory, 'connect').mockReturnValue({} as unknown as ERC20Indexable);
        (getWstEthToStEthRate as Mock).mockImplementation(getWstEthToStEthRateMock);
        (getPositionManagerContract as Mock).mockReturnValue({
          managePosition: null,
          whitelistDelegate: null,
        });
        (buildTransactionWithGasLimit as Mock).mockResolvedValue({
          sendTransaction: vi.fn(),
          gasEstimate: Decimal.ZERO,
          gasLimit: Decimal.ZERO,
        });

        const userPosition = new UserPosition(mockEoaSigner, underlyingCollateralToken);
        const steps = userPosition.getLeverageSteps(Decimal.ONE, new Decimal(0.5), new Decimal(2), new Decimal(0.1), {
          collateralToken,
          currentCollateral: Decimal.ZERO,
          currentDebt: Decimal.ZERO,
          borrowRate: new Decimal(0.1),
          underlyingCollateralPrice: new Decimal(1000),
        });

        vi.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);

        const numberOfSteps = 3;

        const firstStep = await steps.next();
        await firstStep.value?.action?.();

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
          token: collateralToken,
        });
        expect(secondStep.value?.stepNumber).toEqual(2);
        expect(secondStep.value?.numberOfSteps).toEqual(numberOfSteps);

        const thirdStep = await steps.next();

        expect(thirdStep.done).toBe(false);
        expect(thirdStep.value?.type).toEqual({
          name: 'leverage',
        });
        expect(thirdStep.value?.stepNumber).toEqual(3);
        expect(thirdStep.value?.numberOfSteps).toEqual(numberOfSteps);

        const termination = await steps.next();

        expect(termination.done).toBe(true);
      },
    );

    it('should throw an error if provider for signer is not set', () => {
      const userPosition = new UserPosition({} as unknown as Signer, 'wstETH');
      const steps = userPosition.getLeverageSteps(Decimal.ZERO, Decimal.ZERO, new Decimal(2), Decimal.ZERO);

      expect(() => steps.next()).rejects.toThrow('Provider not set, please set provider before calling this method');
    });

    it('should throw an error if provider slippage is too high', () => {
      const swapRouter = '1inch';
      const maxSlippage = SWAP_ROUTER_MAX_SLIPPAGE[swapRouter];
      const slippage = maxSlippage.add(new Decimal(0.001));
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
      const steps = userPosition.getLeverageSteps(Decimal.ONE, new Decimal(0.5), new Decimal(2), slippage, {
        collateralToken: 'wstETH',
        swapRouter,
      });

      expect(() => steps.next()).rejects.toThrow(
        `Slippage (${slippage.toTruncated(4)}) should not be greater than ${maxSlippage.toTruncated(4)}`,
      );
    });
  });
});
